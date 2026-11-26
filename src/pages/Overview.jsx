import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import Notices from '../components/Notices.jsx';
import { KpiTile } from '../components/controls.jsx';
import { useDb, run, go } from '../data/store.js';
import { P, tq, doctorNotices, caseLine } from '../data/selectors.js';
import { decideApproval } from '../data/actions.js';
import { kpis } from '../logic/kpi.js';
import { bal, owing } from '../logic/balance.js';
import { dueFU } from '../logic/followups.js';
import { invAlerts, invQty, nearExp, invStatus } from '../logic/inventory.js';
import { today, fmtS, inr, mins, longDay } from '../logic/format.js';

// The log behind each tile: [column headings, rows of cells]
function kpiLog(db, k) {
  const t = today(), m = t.slice(0, 7), name = (pid) => P(db, pid)?.name || '';
  const pay = (x) => [fmtS(x.date), name(x.pid), x.mode, inr(x.amount)];
  switch (k) {
    case 'today': return [['Token', 'Patient', 'Arrived', 'In–Out', 'Treatment', 'Status'], tq(db).map((x) => { const v = db.visits.find((y) => y.id === x.visitId); return [x.token, name(x.pid), x.time, `${x.inTime || '–'}–${x.outTime || ''}`, v ? v.services.map((s) => s.name).join(', ') : '–', { waiting: 'Waiting', in: 'With you', checkout: 'At checkout', done: 'Done' }[x.status]]; })];
    case 'coltoday': return [['Date', 'Patient', 'Mode', 'Amount'], db.payments.filter((x) => x.date === t).map(pay)];
    case 'colmonth': return [['Date', 'Patient', 'Mode', 'Amount'], db.payments.filter((x) => x.date.startsWith(m)).sort((a, b) => b.date.localeCompare(a.date)).map(pay)];
    case 'dues': return [['Reg No.', 'Patient', 'Category', 'Balance'], owing(db).sort((a, b) => bal(db, b.id) - bal(db, a.id)).map((p) => [p.reg, p.name, p.cat === 'o' ? 'Ortho' : 'General', inr(bal(db, p.id))])];
    case 'chair': return [['Patient', 'In', 'Out', 'Duration'], db.visits.filter((v) => v.date === t && v.inTime && v.outTime).map((v) => [name(v.pid), v.inTime, v.outTime, `${mins(v.outTime) - mins(v.inTime)} min`])];
    case 'ortho': return [['Patient', 'Case', 'Due'], db.cases.filter((c) => c.status === 'open' && c.ortho).map((c) => [name(c.pid), caseLine(c), inr(bal(db, c.pid))])];
    case 'fu': return [['Patient', 'Reason', 'Due', 'Status'], dueFU(db).map((v) => [name(v.pid), v.nextReason || '', fmtS(v.nextVisit), v.fu === 'contacted' ? 'Called' : 'To call'])];
    case 'newp': return [['Reg No.', 'Patient', 'Registered', 'Complaint'], db.patients.filter((p) => (p.created || '').startsWith(m) && !p.imported).map((p) => [p.reg, p.name, fmtS(p.created), p.complaint || ''])];
    case 'exp': return [['Date', 'Item', 'Category', 'Amount'], db.expenses.filter((e) => e.date.startsWith(m)).map((e) => [fmtS(e.date), e.item, e.category, inr(e.amount)])];
    default: return [['Item', 'In stock', 'Expiry', 'Status'], invAlerts(db).map((i) => [i.name, `${invQty(i)} ${i.unit}`, nearExp(i) ? fmtS(nearExp(i)) : '–', invStatus(i)[1]])];
  }
}

export default function Overview() {
  const db = useDb();
  const [open, setOpen] = useState(null);
  const K = kpis(db), sel = K.find((x) => x.k === open), [cols, rows] = sel ? kpiLog(db, sel.k) : [[], []];
  const onAct = (a) => ({ approve: () => run((d) => decideApproval(d, a.arg, true)), keep: () => run((d) => decideApproval(d, a.arg, false)), go: () => go(a.arg), kpi: () => setOpen(a.arg) }[a.do]());
  return (
    <>
      <div className="calm" style={{ maxWidth: 1080 }}>
        <div className="ch"><div><h1>Overview</h1><p className="lede">{longDay()}. Tap a number to see the details.</p></div></div>
        <Notices list={doctorNotices(db)} title="Alerts" onAct={onAct} />
        <div className="kgrid">{K.map((x) => <KpiTile key={x.k} kpi={x} onOpen={setOpen} />)}</div>
      </div>
      {sel && (
        <Modal title={`${sel.l} · ${sel.v}`} onClose={() => setOpen(null)} maxWidth={780}>
          <div style={{ maxHeight: '62vh', overflow: 'auto' }} tabIndex={0} role="region" aria-label={sel.l + ' log'}>
            <table className="tbl" style={{ fontSize: 13 }}>
              <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}{!rows.length && <tr><td colSpan={cols.length} className="muted">Nothing yet.</td></tr>}</tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
