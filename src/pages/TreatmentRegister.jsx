import { useState } from 'react';
import { SortHeader } from '../components/controls.jsx';
import { Head } from '../components/PatientBits.jsx';
import { RegisterPrint } from '../components/Prints.jsx';
import { useDb, useUi, setUi, update, toast } from '../data/store.js';
import { registerRange } from '../data/selectors.js';
import { today, fmtS, inr, sum, sortBy } from '../logic/format.js';

const SORT = { date: (r) => r.date + (r.inT || r.appt || '99'), reg: (r) => r.reg, name: (r) => r.name.toLowerCase(), age: (r) => +r.age || 0, sex: (r) => r.sex, cat: (r) => r.cat, proc: (r) => r.proc.toLowerCase(), appt: (r) => r.appt || '99', in: (r) => r.inT || '99', out: (r) => r.outT || '99', dur: (r) => r.dur ?? 9999, remarks: (r) => r.remarks.toLowerCase(), pay: (r) => r.pay, bal: (r) => r.bal, doc: (r) => r.doc, mobile: (r) => r.mobile };
const COLS = [['date', 'Date'], ['reg', 'ID No.'], ['name', 'Patient name'], ['age', 'Age', 'num'], ['sex', 'Sex'], ['cat', 'Category'], ['proc', 'Treatment procedure'], ['appt', 'Appointment'], ['in', 'In'], ['out', 'Out'], ['dur', 'Duration', 'num'], ['remarks', 'Remarks'], ['pay', 'Payment', 'num'], ['bal', 'Balance', 'num'], ['doc', 'Consulted by'], ['mobile', 'Mobile no.']];

// One report of every visit, filled in automatically from the front desk and the doctor.
export default function TreatmentRegister() {
  const db = useDb(), f = { from: today(), to: today(), cat: 'all', pay: 'all', q: '', ...useUi().treg };
  const set = (patch) => setUi({ treg: { ...f, ...patch } });
  const [sort, setSort] = useState({ k: 'date', dir: -1 });
  const s = f.q.trim().toLowerCase();
  const rows = sortBy(registerRange(db, f.from, f.to).filter((r) =>
    (!s || r.name.toLowerCase().includes(s) || String(r.reg).includes(s) || r.mobile.includes(s) || r.proc.toLowerCase().includes(s) || r.doc.toLowerCase().includes(s)) &&
    (f.cat === 'all' || r.cat === f.cat) && (f.pay === 'all' || (f.pay === 'owes' ? r.owes > 0 : r.owes <= 0))), sort, SORT);
  const saveRemark = (ref, v) => { const [k, id] = ref.split(':'); update((d) => { (k === 'v' ? d.visits : d.queue).find((x) => x.id === id).remarks = v; }); toast('Remark saved'); };
  return (
    <>
      <Head title="Patient treatment register" sub="Every visit, filled in automatically from the front desk and the doctor."><button type="button" className="btn ghost" onClick={() => setUi({ print: <RegisterPrint rows={rows} from={f.from} to={f.to} /> })}>Print</button></Head>
      <div className="filters">
        <label>From<input type="date" value={f.from} onChange={(e) => set({ from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} /></label>
        <label>To<input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
        <label>Category<select value={f.cat} onChange={(e) => set({ cat: e.target.value })}><option value="all">All</option><option value="g">General</option><option value="o">Orthodontics</option></select></label>
        <label>Payment<select value={f.pay} onChange={(e) => set({ pay: e.target.value })}><option value="all">All</option><option value="owes">Owes money</option><option value="paid">Fully paid</option></select></label>
        <label className="grow">Search<input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Name, Reg. No., mobile, treatment or doctor" /></label>
      </div>
      <div className="summary" data-testid="treg-summary">
        <span><b>{rows.length}</b> visits</span><span><b>{new Set(rows.map((r) => r.pid)).size}</b> patients</span><span>Collected <b>{inr(sum(rows, (r) => r.pay))}</b></span>
        {f.pay === 'owes' && <span>Owed <b style={{ color: 'var(--bad)' }}>{inr(sum([...new Map(rows.map((r) => [r.pid, r.owes])).values()], (x) => x))}</b></span>}
      </div>
      <div className="list" style={{ overflow: 'auto' }} tabIndex={0} role="region" aria-label="Treatment register table">
        <table className="tbl reg">
          <thead><tr>{COLS.map(([k, l, cls]) => <th key={k} className={cls}><SortHeader sort={sort} setSort={setSort} k={k} label={l} /></th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="sm">{fmtS(r.date)}</td><td>{r.reg}</td><td><a href={'#/patients/' + r.pid}><b>{r.name}</b></a></td><td className="num">{r.age}</td><td>{r.sex}</td><td className="sm">{r.cat === 'o' ? 'Ortho' : 'General'}</td>
                <td className={r.planned ? 'planned' : ''}>{r.proc}{r.planned && <span className="sm muted"> (planned)</span>}</td>
                <td>{r.walkin ? <span className="sm muted">Walk-in</span> : r.appt}</td><td>{r.inT || '–'}</td>
                <td>{r.outT || (r.st === 'in' ? <span className="sm" style={{ color: 'var(--warn)' }}>in chair</span> : '–')}</td><td className="num">{r.dur != null ? r.dur + ' min' : '–'}</td>
                <td>{r.remRef ? <input className="cellin" defaultValue={r.remarks} key={r.remarks} placeholder="Add" aria-label={`Remarks for ${r.name}`} onBlur={(e) => { if (e.target.value !== r.remarks) saveRemark(r.remRef, e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} /> : <span className="sm muted">–</span>}</td>
                <td className="num">{r.pay ? inr(r.pay) : '–'}</td><td className="num" style={r.bal > 0 ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{inr(r.bal)}</td><td className="sm">{r.doc || '–'}</td><td className="sm">{r.mobile}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="16" className="muted">No visits for these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
