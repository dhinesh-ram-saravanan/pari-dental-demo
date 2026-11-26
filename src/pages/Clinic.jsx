import { useState } from 'react';
import { Segmented, Switch } from '../components/controls.jsx';
import { Head } from '../components/PatientBits.jsx';
import { TeamTable } from './Team.jsx';
import { useDb, update, run, toast, resetDb, setUi, go } from '../data/store.js';
import { P, pendingAppr } from '../data/selectors.js';
import { decideApproval } from '../data/actions.js';
import { today, fmtD, fmtS, inr, sum, uid } from '../logic/format.js';
import { MARKS, EXP_CATS } from '../data/constants.js';

function Prices({ db }) {
  const [f, setF] = useState({ name: '', price: '', cat: 'g' });
  const edit = (id, patch, msg) => { update((d) => Object.assign(d.services.find((s) => s.id === id), patch)); if (msg) toast(msg); };
  const add = (e) => { e.preventDefault(); const name = f.name.trim(); if (!name || f.price === '') return toast('Enter the service name and price'); update((d) => d.services.push({ id: 's' + uid(), cat: f.cat, name, price: +f.price, marks: '', note: '', active: true })); toast('Service added'); setF({ name: '', price: '', cat: f.cat }); };
  return (
    <>
      {['g', 'o'].map((c) => (
        <div key={c}><div className="sec">{c === 'g' ? 'General' : 'Orthodontics'}</div>
          <div className="list">{db.services.filter((s) => s.cat === c).map((s) => (
            <div className="li" key={s.id} style={{ gridTemplateColumns: 'minmax(0,1fr) 120px 150px 44px' }}>
              <div>{s.name}{s.byDoctor && <span className="badge pri"> added in treatment</span>}</div>
              <input type="number" min="0" defaultValue={s.price} key={s.price} aria-label={`Price of ${s.name}`} onBlur={(e) => { if (+e.target.value !== s.price) edit(s.id, { price: +e.target.value || 0 }, 'Price saved'); }} />
              <select aria-label={`${s.name} marks tooth as`} value={s.marks} onChange={(e) => edit(s.id, { marks: e.target.value })}><option value="">No chart mark</option>{Object.entries(MARKS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <Switch on={s.active} label={`${s.name} is offered`} onChange={(v) => edit(s.id, { active: v }, s.name + (v ? ' is offered' : ' is hidden from the list'))} />
            </div>
          ))}</div>
        </div>
      ))}
      <form className="bar" style={{ marginTop: 14 }} onSubmit={add}>
        <input placeholder="New service" aria-label="New service name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input type="number" min="0" placeholder="₹" aria-label="Price" style={{ flex: '0 0 110px', minWidth: 0 }} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <select style={{ width: 'auto' }} aria-label="Type" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}><option value="g">General</option><option value="o">Ortho</option></select>
        <button className="btn primary">Add</button>
      </form>
    </>
  );
}

function Approvals({ db }) {
  const pend = pendingAppr(db), hist = db.approvals.filter((a) => a.status !== 'pending');
  return (
    <>
      {pend.map((x) => (
        <div className="approve" key={x.id}>
          <span>Reception charged <b>{inr(x.price)}</b> for <b>{x.name}</b> ({P(db, x.pid)?.name}, {fmtD(x.date)}). Your list price is {inr(x.old)}. Make {inr(x.price)} the default?</span>
          <span className="row-actions"><button type="button" className="btn sm primary" onClick={() => run((d) => decideApproval(d, x.id, true))}>Set {inr(x.price)} as default</button><button type="button" className="btn sm ghost" onClick={() => run((d) => decideApproval(d, x.id, false))}>Keep {inr(x.old)}</button></span>
        </div>
      ))}
      {!pend.length && <p className="muted">Nothing to approve.</p>}
      <div className="sec">History</div>
      {hist.map((a) => <div className="row-item" key={a.id}><span>{a.name}: {inr(a.old)} → {inr(a.price)}</span><span className={'pill ' + (a.status === 'approved' ? 'done' : '')}>{a.status === 'approved' ? 'New default' : 'Kept old'}</span></div>)}
      {!hist.length && <p className="sm muted">None yet.</p>}
    </>
  );
}

function Expenses({ db }) {
  const blank = { date: today(), category: EXP_CATS[0], item: '', amount: '', vendor: '' };
  const [f, setF] = useState(blank), set = (k, v) => setF({ ...f, [k]: v });
  const ex = db.expenses.filter((e) => e.date.startsWith(today().slice(0, 7))).sort((a, b) => b.date.localeCompare(a.date));
  const add = (e) => { e.preventDefault(); if (!f.item.trim() || !(+f.amount > 0)) return toast('Enter the item and an amount above 0'); update((d) => d.expenses.push({ id: uid(), ...f, item: f.item.trim(), amount: +f.amount })); toast('Expense added'); setF(blank); };
  return (
    <>
      <form className="bar" onSubmit={add}>
        <input type="date" aria-label="Date" style={{ flex: '0 0 auto', width: 'auto', minWidth: 0 }} value={f.date} max={today()} onChange={(e) => set('date', e.target.value)} />
        <select style={{ width: 'auto' }} aria-label="Category" value={f.category} onChange={(e) => set('category', e.target.value)}>{EXP_CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <input placeholder="Item" aria-label="Item" value={f.item} onChange={(e) => set('item', e.target.value)} />
        <input type="number" min="1" placeholder="₹" aria-label="Amount" style={{ flex: '0 0 110px', minWidth: 0 }} value={f.amount} onChange={(e) => set('amount', e.target.value)} />
        <button className="btn primary">Add</button>
      </form>
      <div className="sec">This month · {inr(sum(ex, (e) => e.amount))}</div>
      <div className="list">{ex.map((e) => <div className="li" key={e.id}><div className="when">{fmtS(e.date).slice(0, 5)}</div><div><b>{e.item}</b><div className="what">{e.category}{e.vendor ? ' · ' + e.vendor : ''}</div></div><span>{inr(e.amount)}</span></div>)}</div>
    </>
  );
}

function Settings({ db }) {
  const [f, setF] = useState({ name: db.clinic.name, phone: db.clinic.phone, template: db.clinic.template });
  return (
    <form onSubmit={(e) => { e.preventDefault(); update((d) => Object.assign(d.clinic, f)); toast('Saved'); }}>
      <div className="fgrid"><label>Clinic name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label><label>Phone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label></div>
      <label>Reminder message<textarea rows="3" value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} /></label>
      <p className="sm muted">Use {'{name}'}, {'{clinic}'}, {'{reason}'}, {'{date}'} and {'{phone}'}.</p>
      <button className="btn primary">Save</button>{' '}
      <button type="button" className="btn ghost" onClick={() => { if (window.confirm('Reset all demo data?')) { resetDb(); setUi({ doc: null, co: null }); toast('Demo data reset'); go('/doctor'); } }}>Reset demo data</button>
    </form>
  );
}

// Doctor's settings: prices, price approvals, expenses, team, reminder template.
export default function Clinic() {
  const db = useDb(), n = pendingAppr(db).length;
  const [tab, setTab] = useState('prices');
  return (
    <>
      <Head title="Clinic" />
      <div className="bar"><Segmented label="Section" value={tab} onChange={setTab} options={[['prices', 'Prices'], ['appr', 'Approvals' + (n ? ' ' + n : '')], ['exp', 'Expenses'], ['team', 'Team'], ['set', 'Settings']]} /></div>
      {tab === 'prices' && <Prices db={db} />}{tab === 'appr' && <Approvals db={db} />}{tab === 'exp' && <Expenses db={db} />}{tab === 'team' && <TeamTable />}{tab === 'set' && <Settings db={db} />}
    </>
  );
}
