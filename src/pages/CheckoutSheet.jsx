import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { RxPrint } from '../components/Prints.jsx';
import { useDb, useUi, setUi, run, update, toast } from '../data/store.js';
import { P, svByName, treaters, caseLine, waLink, remind } from '../data/selectors.js';
import { checkout } from '../data/actions.js';
import { balBefore } from '../logic/balance.js';
import { today, inr, sum, uid } from '../logic/format.js';
import { NEXTS, SLOTS } from '../data/constants.js';

// Reception's checkout, as a sheet over the front desk. Draft lives in ui.co.
export default function CheckoutSheet() {
  const db = useDb(), { co } = useUi();
  const [staff, setStaff] = useState(null); // inline "+ Add" for Handled by
  const x = db.queue.find((y) => y.id === co.qid), v = x && db.visits.find((y) => y.id === x.visitId);
  if (!v || x.status !== 'checkout') return null; // finished in another tab
  const p = P(db, x.pid), c = db.cases.find((y) => y.id === v.caseId);
  const set = (patch) => setUi({ co: { ...co, ...patch } });
  const charge = sum(co.lines, (l) => l.price), prev = balBefore(db, p.id, v.id), due = prev + charge, paid = +co.paid || 0, nb = due - paid;
  const chip = (on, label, onClick) => <button key={label} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick}>{label}</button>;
  return (
    <Modal title={`${p.name} · checkout`} onClose={() => setUi({ co: null })}>
      {co.lines.map((l, i) => {
        const s = svByName(db, l.name), diff = s && l.price !== null && s.price !== l.price;
        return (
          <div className="due" key={i}>
            <span>{l.name}{l.teeth.length ? ' · ' + l.teeth.join(', ') : ''}{l.price === null ? <span className="badge warn"> enter price</span> : diff ? <span className="badge warn"> list {inr(s.price)}</span> : null}</span>
            <input type="number" min="0" value={l.price ?? ''} placeholder={s?.price ? String(s.price) : '₹'} style={{ width: 100, textAlign: 'right' }} aria-label={`Price for ${l.name}`}
              onChange={(e) => set({ lines: co.lines.map((y, j) => (j === i ? { ...y, price: e.target.value === '' ? null : +e.target.value } : y)) })} />
          </div>
        );
      })}
      <div className="due muted"><span>Previous balance</span><span>{inr(prev)}</span></div>
      <div className="due tot"><span>Total due</span><span data-testid="total-due">{inr(due)}</span></div>
      <div className="sec">Payment</div>
      <div className="amt">₹<input type="number" min="0" value={co.paid} aria-label="Amount received" onChange={(e) => set({ paid: e.target.value })} /></div>
      <div className="chips" style={{ marginTop: 8 }}>
        {chip(co.paid !== '' && paid === due, 'Full', () => set({ paid: String(due) }))}{chip(co.paid === '0', 'Nothing today', () => set({ paid: '0' }))}
        {['Cash', 'UPI', 'Card'].map((m) => chip(co.mode === m, m, () => set({ mode: m })))}
      </div>
      <div className={'bal' + (nb <= 0 ? ' zero' : '')}><span>{nb < 0 ? 'Advance' : 'Balance carried forward'}</span><b data-testid="carried">{inr(Math.abs(nb))}</b></div>
      <div className="sec">Handled by</div>
      <div className="chips">
        {treaters(db).map((s) => chip(co.handled === s.name, s.name + (s.role === 'Junior doctor' ? ' (junior)' : ''), () => set({ handled: s.name })))}
        <button type="button" className="chip" onClick={() => setStaff({ name: '', role: 'Junior doctor' })}>+ Add</button>
      </div>
      {staff && (
        <div className="row-actions" style={{ marginBottom: 8 }}>
          <input placeholder="Name, e.g. Dr. Keerthana" aria-label="New team member name" style={{ flex: 1 }} value={staff.name} onChange={(e) => setStaff({ ...staff, name: e.target.value })} />
          <select aria-label="Role" style={{ width: 'auto' }} value={staff.role} onChange={(e) => setStaff({ ...staff, role: e.target.value })}><option>Junior doctor</option><option>Doctor</option></select>
          <button type="button" className="btn sm primary" onClick={() => {
            const n = staff.name.trim(); if (!n) return toast('Enter a name');
            update((d) => d.staff.push({ id: uid(), name: n, role: staff.role, phone: '', active: true }));
            set({ handled: n }); setStaff(null); toast(n + ' added to the team');
          }}>Add</button>
        </div>
      )}
      {v.rx && <><div className="sec">Prescription</div><div className="row-actions"><div className="rx" style={{ flex: 1 }}>{v.rx}</div><button type="button" className="btn sm" onClick={() => setUi({ print: <RxPrint db={db} visit={v} /> })}>Print</button></div></>}
      <div className="sec">Next visit {v.suggest && <span style={{ textTransform: 'none', fontWeight: 500 }}>· doctor suggests {v.nextReason || 'review'} in {NEXTS.find((n) => n[0] === v.suggest)?.[1]}</span>}</div>
      <div className="chips">{[['book', 'Book now'], ['remind', 'Remind later'], ['none', 'Not needed']].map(([k, l]) => chip(co.nextMode === k, l, () => set({ nextMode: k })))}</div>
      {co.nextMode !== 'none' && (
        <div className="fgrid3">
          <label>Reason<input value={co.reason} onChange={(e) => set({ reason: e.target.value })} /></label>
          <label>Date<input type="date" value={co.date} min={today()} onChange={(e) => set({ date: e.target.value })} /></label>
          {co.nextMode === 'book' ? <label>Time<select value={co.time} onChange={(e) => set({ time: e.target.value })}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label> : <span />}
        </div>
      )}
      <p className="sm muted" style={{ margin: '0 0 12px' }}>Plan: {c ? (c.status === 'closed' ? 'completed' : 'ongoing, ' + caseLine(c)) : '–'}</p>
      <div className="row-actions" style={{ justifyContent: 'space-between' }}>
        <span><b>{inr(paid)}</b> received · {nb < 0 ? 'advance ' + inr(-nb) : 'balance ' + inr(nb)}</span>
        <span className="row-actions">
          {co.nextMode === 'book' && <a className="btn wa" target="_blank" rel="noopener noreferrer" href={waLink(p, remind(db, p, co.date, co.reason, co.time))}>WhatsApp</a>}
          <button type="button" className="btn primary lg" onClick={() => { if (run((d) => checkout(d, co)).ok) setUi({ co: null }); }}>Save</button>
        </span>
      </div>
    </Modal>
  );
}
