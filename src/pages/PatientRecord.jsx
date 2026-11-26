import { useState } from 'react';
import ToothChart from '../components/ToothChart.jsx';
import { Head, FormCard, SheetTable, VisitsList } from '../components/PatientBits.jsx';
import { RecordPrint } from '../components/Prints.jsx';
import { useDb, useUi, setUi, run, go } from '../data/store.js';
import { P, waLink, dueMsg } from '../data/selectors.js';
import { addToQueue, payDue } from '../data/actions.js';
import { bal } from '../logic/balance.js';
import { inr } from '../logic/format.js';

export default function PatientRecord({ id }) {
  const db = useDb(), rec = useUi().role === 'reception', p = P(db, id);
  const [amt, setAmt] = useState(''), [mode, setMode] = useState('Cash');
  if (!p) return <Head title="Patient not found" />;
  const b = bal(db, p.id);
  return (
    <>
      <Head title={`${p.title} ${p.name}`} sub={p.cat === 'o' ? 'Orthodontics' : 'General'}>
        <button type="button" className="btn ghost" onClick={() => setUi({ print: <RecordPrint db={db} p={p} /> })}>Print</button>
        {rec && <>
          <button type="button" className="btn ghost" onClick={() => go('/register/' + p.id)}>Edit form</button>
          <button type="button" className="btn ghost" onClick={() => setUi({ book: { pid: p.id } })}>Book</button>
          <button type="button" className="btn primary" onClick={() => { if (run((d) => addToQueue(d, p.id, 'Walk-in')).ok) go('/front-desk'); }}>Add to today</button>
        </>}
      </Head>
      <FormCard p={p} />
      <div className="sec">Date · Treatment record · Payment · Balance</div>
      <div className="panel">
        <SheetTable db={db} pid={p.id} />
        <div className="due tot"><span>Balance</span><span data-testid="balance" style={b > 0 ? { color: 'var(--bad)' } : undefined}>{inr(b)}</span></div>
        {rec && b > 0 && (
          <div className="row-actions" style={{ marginTop: 8 }}>
            <input type="number" min="1" placeholder="₹ amount" aria-label="Amount to collect" style={{ width: 120 }} value={amt} onChange={(e) => setAmt(e.target.value)} />
            <select aria-label="Payment mode" style={{ width: 'auto' }} value={mode} onChange={(e) => setMode(e.target.value)}><option>Cash</option><option>UPI</option><option>Card</option></select>
            <button type="button" className="btn sm primary" onClick={() => { if (run((d) => payDue(d, p.id, amt, mode)).ok) setAmt(''); }}>Collect</button>
            <a className="btn sm wa" target="_blank" rel="noopener noreferrer" href={waLink(p, dueMsg(db, p))}>Remind</a>
          </div>
        )}
      </div>
      <details className="more"><summary>Tooth chart and treatment plans</summary>
        <ToothChart chart={db.charts[p.id]} k={0.7} />
        {db.cases.filter((c) => c.pid === p.id).map((c) => <div className="row-item" key={c.id}><span><b>{c.title}</b> <span className="sm muted">{c.items.filter((x) => x.done).length} of {c.items.length} done</span></span><span className={'pill ' + (c.status === 'open' ? 'wait' : 'done')}>{c.status === 'open' ? 'Ongoing' : 'Completed'}</span></div>)}
      </details>
      <details className="more"><summary>Visits and prescriptions</summary><VisitsList db={db} pid={p.id} /></details>
    </>
  );
}
