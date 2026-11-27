import { useEffect, useState } from 'react';
import ToothChart from '../components/ToothChart.jsx';
import Modal from '../components/Modal.jsx';
import { Segmented } from '../components/controls.jsx';
import { Head, FormCard, SheetTable, VisitsList } from '../components/PatientBits.jsx';
import { useDb, useUi, setUi, run, update, go } from '../data/store.js';
import { P, SV, svByName, tq, curQ, todayRows, alertsOf, openCases, procOf, pendingAppr, itemText } from '../data/selectors.js';
import { handOver, takeBack } from '../data/actions.js';
import { labFor, labText } from '../logic/lab.js';
import { ageOf } from '../logic/age.js';
import { today, fmtD, nowT, minsAgo, inr, sum, uid, sortBy } from '../logic/format.js';
import { MARKS, NEXTS, RX, ALLERGY_CLASH } from '../data/constants.js';

const blankRec = (teeth = '') => ({ key: uid(), svcId: '', name: '', teeth, price: '', planItemId: null, when: 'done' });
// Lab-made work starts as "measurement taken"; once an order exists for it, the next step is the fitting.
const stepFor = (db, pid, s) => (!s?.lab ? 'done' : labFor(db, pid).some((o) => o.svcId === s.id) ? 'fit' : 'measure');
const recFromItem = (db, x, pid) => {
  const s = SV(db, x.svcId) || svByName(db, x.name), when = stepFor(db, pid, s);
  return { key: uid(), svcId: s?.id || 'other', name: x.name, teeth: x.teeth.join(', '), price: when === 'fit' ? '0' : x.price ? String(x.price) : '', planItemId: x.id, when };
};

function newDraft(db, cur) {
  const oc = openCases(db, cur.pid), here = labFor(db, cur.pid).find((o) => o.status === 'arrived');
  // lab work that has arrived is what this visit is for
  const nx = (here && oc.flatMap((c) => c.items).find((x) => x.id === here.itemId && !x.done)) || oc[0]?.items.find((x) => !x.done);
  return { qid: cur.id, pid: cur.pid, teeth: [], caseId: oc[0]?.id || 'new', rx: '', remarks: '', notes: '', notesTouched: false, nextIn: '', nextReason: '', reasonTouched: false, close: null, milk: (ageOf(P(db, cur.pid)) ?? 99) < 13, recs: [nx ? recFromItem(db, nx, cur.pid) : blankRec()] };
}

function Peek({ db, pid, onClose }) {
  const p = P(db, pid);
  if (!p) return null; // removed on another screen
  return (
    <Modal title={`${p.title} ${p.name}`} onClose={onClose} maxWidth={760}>
      <FormCard p={p} />
      <div className="sec">Date · Treatment record · Payment · Balance</div><SheetTable db={db} pid={pid} />
      <div className="sec">Treatment plan</div>
      {openCases(db, pid).map((c) => <div className="row-item" key={c.id}><span><b>{c.title}</b> <span className="sm muted">next: {procOf(db, pid)}</span></span><span className="sm muted">{c.items.filter((x) => x.done).length} of {c.items.length} done</span></div>)}
      {!openCases(db, pid).length && <p className="sm muted">No open plan.</p>}
      <details className="more"><summary>Tooth chart</summary><ToothChart chart={db.charts[pid]} k={0.6} /></details>
    </Modal>
  );
}

// Patient in the chair: form card, chart, today's treatment record, hand over.
function Consult({ db, cur, d }) {
  const p = P(db, cur.pid), set = (patch) => setUi({ doc: { ...d, ...patch } });
  const cs = openCases(db, p.id), c = db.cases.find((x) => x.id === d.caseId), items = c ? c.items : [];
  const used = new Set(d.recs.map((r) => r.planItemId).filter(Boolean)), pending = items.filter((x) => !x.done && !used.has(x.id));
  // A plan stays open while anything is still planned or a next visit is asked for.
  const measuring = d.recs.some((r) => r.name && r.when === 'measure'), orders = labFor(db, p.id);
  const closeIt = d.close ?? (pending.length === 0 && !d.nextIn && !d.recs.some((r) => r.name && (r.when === 'later' || r.when === 'measure')));
  const nextReason = d.reasonTouched ? d.nextReason : pending[0] ? itemText(pending[0]) : p.cat === 'o' ? 'Monthly adjustment' : 'Review';
  // Clinical notes start from each treatment's usual note; the doctor can change every word.
  const notes = d.notesTouched ? d.notes : [...new Set(d.recs.filter((r) => r.when !== 'later' && r.when !== 'measure').map((r) => SV(db, r.svcId)?.note).filter(Boolean))].join(' ');
  const lastRx = db.visits.filter((v) => v.pid === p.id && v.rx).sort((a, b) => b.date.localeCompare(a.date))[0]?.rx;
  const allergy = [p.allergy, p.other].filter(Boolean).join(' '), clash = (text) => ALLERGY_CLASH.some(([a, m]) => a.test(allergy) && m.test(text));
  const addRx = (text) => { if (clash(text) && !window.confirm(`${p.name} is allergic to ${p.allergy}. Add “${text.split(',')[0]}” anyway?`)) return; set({ rx: (d.rx ? d.rx + '\n' : '') + text }); };
  const filled = d.recs.filter((r) => r.name && r.when !== 'later'), later = d.recs.filter((r) => r.name && r.when === 'later').length, noPrice = filled.filter((r) => r.price === '').length, tot = sum(filled, (r) => +r.price || 0);
  const setRec = (i, patch) => set({ recs: d.recs.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const pickSvc = (i, v) => {
    const s = v && v !== 'other' ? SV(db, v) : null, r = d.recs[i];
    // choosing something that is already planned picks up its teeth and price, and ticks the plan
    const plan = s && items.find((x) => !x.done && !used.has(x.id) && x.name === s.name);
    const when = r.when === 'later' ? 'later' : stepFor(db, p.id, s);
    setRec(i, { svcId: v, planItemId: plan?.id || null, name: s ? s.name : '', when, teeth: r.teeth || (plan ? plan.teeth.join(', ') : ''), price: when === 'fit' ? '0' : plan?.price ? String(plan.price) : s ? (s.price ? String(s.price) : '') : r.price });
  };
  const opts = (cat) => db.services.filter((x) => x.cat === cat && x.active).map((x) => <option key={x.id} value={x.id}>{x.name}{x.price ? ' · ' + inr(x.price) : ''}</option>);
  // Marking keeps the teeth selected, so the same teeth can go straight into a treatment row.
  const mark = (m) => update((x) => { const ch = (x.charts[p.id] = x.charts[p.id] || {}); d.teeth.forEach((n) => { if (m) ch[n] = m; else delete ch[n]; }); });
  // Selected teeth go to the first row that has a treatment but no teeth yet, else to a new row. Nothing is overwritten.
  const teethToRec = () => {
    const tt = [...d.teeth].sort().join(', '), k = d.recs.findIndex((r) => !r.teeth && (!r.svcId || SV(db, r.svcId)?.marks || r.svcId === 'other'));
    set({ recs: k >= 0 ? d.recs.map((r, j) => (j === k ? { ...r, teeth: tt } : r)) : [...d.recs, blankRec(tt)], teeth: [] });
  };
  const fromPlan = (it) => { const r = recFromItem(db, it, p.id), e = d.recs.findIndex((x) => !x.name); set({ recs: e >= 0 ? d.recs.map((x, j) => (j === e ? r : x)) : [...d.recs, r] }); };
  const save = () => { if (run((x) => handOver(x, { ...d, nextReason, notes, close: closeIt })).ok) setUi({ doc: null }); };
  return (
    <>
      <div className="inchair" data-testid="in-chair"><i />In your chair since {cur.inTime || cur.time} · token {cur.token} · sent in by reception</div>
      <Head title={`${p.title} ${p.name}`} sub={`${cur.source} · ${procOf(db, p.id)}`}><button type="button" className="btn ghost" onClick={() => setUi({ peek: p.id })}>Record sheet</button></Head>
      <FormCard p={p} />
      {orders.map((o) => <p key={o.id} className={'labnote' + (o.status === 'arrived' ? ' in' : '')}><b>{labText(o)}</b> {o.status === 'arrived' ? `has arrived from the supplier (${fmtD(o.arrivedOn)}). Ready to fit.` : `is with the supplier${o.lab ? ', ' + o.lab : ''}, measured ${fmtD(o.measuredOn)}${o.expected ? ', expected ' + fmtD(o.expected) : ''}.`}</p>)}
      <div className="panel">
        <div className="ph"><h2>Examination</h2>
          {cs.length > 0 && <select style={{ width: 'auto' }} aria-label="Treatment plan" value={d.caseId} onChange={(e) => set({ caseId: e.target.value, close: null, reasonTouched: false, recs: d.recs.map((r) => ({ ...r, planItemId: null })) })}>{cs.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}<option value="new">+ New plan</option></select>}
        </div>
        <Segmented label="Teeth shown" value={d.milk ? 'milk' : 'adult'} options={[['adult', 'Adult teeth'], ['milk', 'Milk teeth']]} onChange={(v) => set({ milk: v === 'milk', teeth: [] })} />
        <ToothChart chart={db.charts[p.id]} selected={d.teeth} k={d.milk ? 0.7 : 0.55} milk={d.milk} onToggle={(n) => set({ teeth: d.teeth.includes(n) ? d.teeth.filter((x) => x !== n) : [...d.teeth, n] })} />
        {d.teeth.length > 0 && (
          <div className="marks"><span className="sm muted">{d.teeth.join(', ')}:</span>
            {Object.entries(MARKS).map(([k, l]) => <button type="button" className="mk" key={k} onClick={() => mark(k)}><i style={{ background: `var(--t-${k})` }} />{l}</button>)}
            <button type="button" className="mk" onClick={() => mark('')}>Healthy</button><button type="button" className="mk" onClick={teethToRec}>Use for treatment</button>
          </div>
        )}
        <div className="sec" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Treatment record · today</span><span className="sm muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Price is optional. Leave it blank and reception will enter it.</span></div>
        <div className="rechd"><span>Treatment</span><span>Teeth</span><span>Price (₹)</span><span /></div>
        {d.recs.map((r, i) => (
          <div className="recrow" key={r.key}>
            <div>
              <select aria-label={`Treatment ${i + 1}`} value={r.svcId} onChange={(e) => pickSvc(i, e.target.value)}>
                <option value="">Choose treatment…</option><optgroup label="General">{opts('g')}</optgroup><optgroup label="Orthodontics">{opts('o')}</optgroup><option value="other">Other (type it)</option>
              </select>
              {r.svcId === 'other' && <input value={r.name} placeholder="Type the treatment" aria-label={`Treatment ${i + 1} name`} style={{ marginTop: 6 }} onChange={(e) => setRec(i, { name: e.target.value })} />}
              {r.name && <select className="stepsel" aria-label={`Step for treatment ${i + 1}`} value={r.when || 'done'} onChange={(e) => setRec(i, { when: e.target.value, price: e.target.value === 'fit' && r.price === String(SV(db, r.svcId)?.price) ? '0' : r.price })}>
                {SV(db, r.svcId)?.lab ? <><option value="measure">Measurement taken today (goes to the supplier)</option><option value="fit">Fitted today</option></> : <option value="done">Done today</option>}
                <option value="later">Planned for a later visit</option>
              </select>}
            </div>
            <input value={r.teeth} placeholder="Teeth" aria-label={`Teeth for treatment ${i + 1}`} onChange={(e) => setRec(i, { teeth: e.target.value })} />
            <input type="number" min="0" value={r.price} placeholder="Reception" aria-label={`Price for treatment ${i + 1} (optional)`} onChange={(e) => setRec(i, { price: e.target.value })} />
            <button type="button" className="icon" aria-label={`Remove treatment ${i + 1}`} onClick={() => set({ recs: d.recs.length > 1 ? d.recs.filter((_, j) => j !== i) : [blankRec()] })}>×</button>
          </div>
        ))}
        <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => set({ recs: [...d.recs, blankRec([...d.teeth].sort().join(', '))], teeth: [] })}>+ Add treatment</button>
        {pending.length > 0 && <p className="sm muted" style={{ margin: '12px 0 0' }}>Still planned: {pending.map((x, i) => <span key={x.id}>{i > 0 && ', '}<button type="button" className="linkbtn" onClick={() => fromPlan(x)}>{itemText(x)}</button></span>)}</p>}
        <label style={{ marginTop: 12 }}>Clinical notes<textarea rows="2" value={notes} placeholder="Findings and what was done. Filled in from the treatments you choose." onChange={(e) => set({ notes: e.target.value, notesTouched: true })} /></label>
        <label>Remarks for the register (optional)<input value={d.remarks} placeholder="Shown in the treatment register" onChange={(e) => set({ remarks: e.target.value })} /></label>
        <div className="sec">Next visit</div>
        {measuring && <p className="sm muted" style={{ margin: '-4px 0 8px' }}>Lab work goes to the supplier. Reception calls the patient when it arrives, so no date is needed now.</p>}
        <div className="chips" role="group" aria-label="Next visit">{NEXTS.map(([v, l]) => <button type="button" key={v} className={'chip' + (d.nextIn === v ? ' on' : '')} aria-pressed={d.nextIn === v} onClick={() => set({ nextIn: v })}>{l}</button>)}</div>
        {d.nextIn && <input value={nextReason} aria-label="Reason for next visit" placeholder="Reason, e.g. Review" style={{ marginBottom: 8 }} onChange={(e) => set({ nextReason: e.target.value, reasonTouched: true })} />}
        <div className="lbl" style={{ marginTop: 12 }}>This treatment plan is</div><Segmented label="This treatment plan is" value={closeIt ? 'done' : 'open'} options={[['open', 'Ongoing'], ['done', 'Completed']]} onChange={(v) => set({ close: v === 'done' })} />
        <details className="more" open={!!d.rx}><summary>Prescription{d.rx ? ' ✓' : ''}</summary>
          {p.allergy && <p className="warnline">Allergic to {p.allergy}</p>}
          <div className="quick">{lastRx && <button type="button" className="rxchip" onClick={() => addRx(lastRx)}>+ Repeat last prescription</button>}{(db.clinic.rx || RX).map((r) => <button type="button" className="rxchip" key={r} onClick={() => addRx(r)}>+ {r.split(',')[0]}</button>)}</div>
          <textarea rows="3" aria-label="Prescription" value={d.rx} onChange={(e) => set({ rx: e.target.value })} />
        </details>
        <details className="more"><summary>Previous visits</summary><VisitsList db={db} pid={p.id} n={5} /></details>
      </div>
      <div className="savebar">
        <div><b>{filled.length ? filled.map((r) => r.name).join(', ') : 'Choose what you did today'}</b>
          <span>{filled.length ? (tot ? inr(tot) : '') + (noPrice ? `${tot ? ' + ' : ''}${noPrice} price${noPrice > 1 ? 's' : ''} for reception` : '') : ''}{later ? ` · ${later} planned for later` : ''}{d.nextIn ? ' · next in ' + NEXTS.find((n) => n[0] === d.nextIn)[1] : ''}</span></div>
        <button type="button" className="btn primary lg" onClick={save}>Hand over to reception</button>
      </div>
    </>
  );
}

function PCard({ db, r, first }) {
  const p = P(db, r.pid), late = r.st === 'notyet' && r.time < nowT();
  return (
    <button type="button" className={'pcard sm' + (first ? ' next' : '')} onClick={() => setUi({ peek: p.id })}>
      <div className="top"><span>{r.k === 'q' ? `Token ${r.token} · arrived ${r.time}` : r.time + (late ? ' · late' : '')}</span>{p.cat === 'o' && <span className="badge cat-o">Ortho</span>}</div>
      <div className="nm">{p.name}</div><div className="pr">{r.reason}</div>{first && <div className="sm" style={{ color: 'var(--brass-ink, var(--ink))', fontWeight: 700 }}>Next in line</div>}
    </button>
  );
}

const FILTERS = [['all', 'All'], ['waiting', 'Waiting'], ['notyet', 'To come'], ['o', 'Ortho'], ['alert', 'Alerts']];

export default function Doctor() {
  const db = useDb(), ui = useUi(), cur = curQ(db);
  const [q, setQ] = useState(''), [filter, setFilter] = useState('all'), [sort, setSort] = useState({ k: 'time', dir: 1 }), [sel, setSel] = useState(null);
  const d = cur && ui.doc?.qid === cur.id ? ui.doc : null;
  useEffect(() => { if (cur && !d) setUi({ doc: newDraft(db, cur) }); }, [cur, d, db]);
  const rows = todayRows(db), wait = rows.filter((r) => r.st === 'waiting').sort((a, b) => a.token - b.token), come = rows.filter((r) => r.st === 'notyet');
  const seen = tq(db).filter((x) => x.status === 'done' || x.status === 'checkout').length;
  const peek = ui.peek && <Peek db={db} pid={ui.peek} onClose={() => setUi({ peek: null })} />;

  if (cur) return (
    <>
      <div className="dgrid">
        <div>{d && <Consult db={db} cur={cur} d={d} />}</div>
        <aside aria-label="Queue">
          <div className="sec" style={{ marginTop: 0 }}>Waiting · {wait.length}</div>{wait.map((r, i) => <PCard key={r.id} db={db} r={r} first={i === 0} />)}{!wait.length && <p className="sm muted">No one waiting.</p>}
          <div className="sec">Still to come · {come.length}</div>{come.map((r) => <PCard key={r.id} db={db} r={r} />)}{!come.length && <p className="sm muted">No more bookings.</p>}
          <p className="sm muted">Seen today: {seen}</p>
        </aside>
      </div>
      {peek}
    </>
  );

  // Chair free: one calm column.
  const s = q.trim().toLowerCase(), ap = pendingAppr(db).length;
  let list = rows.filter((r) => r.st === 'waiting' || r.st === 'notyet');
  if (s) list = list.filter((r) => { const p = P(db, r.pid); return p.name.toLowerCase().includes(s) || String(p.reg).includes(s) || r.reason.toLowerCase().includes(s); });
  if (filter === 'waiting' || filter === 'notyet') list = list.filter((r) => r.st === filter); else if (filter === 'o') list = list.filter((r) => P(db, r.pid).cat === 'o'); else if (filter === 'alert') list = list.filter((r) => alertsOf(P(db, r.pid)).length);
  list = sortBy(list, sort, { time: (r) => r.time, name: (r) => P(db, r.pid).name.toLowerCase(), wait: (r) => (r.st === 'waiting' ? -minsAgo(r.time) : 9999) });
  const li = (r) => {
    const p = P(db, r.pid), open = sel === p.id, nx = wait[0]?.id === r.id, wm = minsAgo(r.time), al = alertsOf(p);
    const meta = r.st === 'waiting' ? `${wm} min` : r.time < nowT() ? 'Late' : '';
    return (
      <li key={r.k + r.id} className={(nx ? 'next ' : '') + (open ? 'open' : '')}>
        <button type="button" className="rowbtn" aria-expanded={open} onClick={() => setSel(open ? null : p.id)}>
          <span className="tm">{r.time}</span>
          <span className="pwho"><b>{p.name}</b><span className="rs">{r.reason}{p.cat === 'o' ? ', ortho' : ''}</span>{al.length > 0 && <span className="al">{al.join(', ')}</span>}</span>
          <span className={'meta' + ((r.st === 'waiting' && wm > 30) || meta === 'Late' ? ' warn' : '')}>{nx && <b>Next</b>}{meta}</span>
        </button>
        {open && (
          <div className="rowsheet">
            <div className="kv">{[['Age / Sex', `${ageOf(p) ?? '–'} / ${p.sex || '–'}`], ['Reg. No.', p.reg], ['Mobile', p.mobile], ['Profession', p.prof], ['Referred by', p.ref], ['Form', p.sig ? 'Signed' : 'Not signed']].map(([l, v]) => <div key={l}><span>{l}</span>{v || '–'}</div>)}</div>
            <div className="cmpl"><span>Complaint</span>{p.complaint || '–'}</div>
            {db.visits.some((v) => v.pid === p.id) ? <SheetTable db={db} pid={p.id} /> : <p className="sm muted" style={{ margin: 0 }}>First visit. No treatment yet.</p>}
            {openCases(db, p.id)[0] && <p className="sm" style={{ margin: '12px 0 0' }}>Open plan: <b>{openCases(db, p.id)[0].title}</b>, next {procOf(db, p.id)}</p>}
            <p className="sm" style={{ margin: '10px 0 0' }}><a href={'#/patients/' + p.id}>Open full record</a></p>
          </div>
        )}
      </li>
    );
  };
  const group = (title, st, empty) => { const g = list.filter((r) => r.st === st); return <><h2 className="grp">{title} <span>{g.length}</span></h2>{g.length ? <ul className="rows">{g.map(li)}</ul> : <p className="empty-line">{empty}</p>}</>; };
  return (
    <div className="calm">
      <div className="ch">
        <div><h1>Today</h1><p className="lede" data-testid="chair-status"><b>Chair free.</b> {wait.length} waiting, {come.length} still to come, {seen} seen. <span className="sm muted">{fmtD(today())}</span></p></div>
        {ap > 0 && <button type="button" className="appr" onClick={() => go('/overview')}>{ap} price change{ap > 1 ? 's' : ''} to approve</button>}
      </div>
      <div className="tools">
        <input type="search" placeholder="Find a patient or treatment" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label="Find a patient or treatment" />
        <div className="chipset" role="group" aria-label="Filter">{FILTERS.map(([k, l]) => <button type="button" key={k} className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <div className="sortctl">
          <select aria-label="Sort by" value={sort.k} onChange={(e) => setSort({ ...sort, k: e.target.value })}><option value="time">Time</option><option value="name">Name</option><option value="wait">Time waited</option></select>
          <button type="button" aria-label={sort.dir > 0 ? 'Ascending, tap for descending' : 'Descending, tap for ascending'} onClick={() => setSort({ ...sort, dir: -sort.dir })}>{sort.dir > 0 ? '↑' : '↓'}</button>
        </div>
      </div>
      {tq(db).filter((x) => x.status === 'checkout').map((x) => (
        <p key={x.id} className="sm muted" style={{ margin: '0 0 6px' }}>Handed over to reception: <b style={{ color: 'var(--ink)' }}>{P(db, x.pid).name}</b>. <button type="button" className="linkbtn" onClick={() => { const r = run((dd) => takeBack(dd, x.id)); if (r.ok) setUi({ doc: r.draft }); }}>Take back to correct</button></p>
      ))}
      {group('Waiting', 'waiting', 'No one is waiting.')}{group('Still to come', 'notyet', 'No more appointments today.')}
      {peek}
    </div>
  );
}
