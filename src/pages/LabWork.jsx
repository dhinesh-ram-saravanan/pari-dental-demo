import { useState } from 'react';
import Menu from '../components/Menu.jsx';
import Modal from '../components/Modal.jsx';
import { Field } from '../components/controls.jsx';
import { useDb, setUi, run, go } from '../data/store.js';
import { P, contactItems } from '../data/selectors.js';
import { labOverdue, fittingBooked, labText, setLabDetails, markArrived, backToWaitingLab, cancelLab } from '../logic/lab.js';
import { today, fmtD, fmtS } from '../logic/format.js';

const dm = (d) => fmtS(d).slice(0, 5);

function Details({ db, o, onClose }) {
  const [f, setF] = useState({ lab: o.lab, expected: o.expected, cost: o.cost ?? '' }), set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const labs = [...new Set(db.labOrders.map((x) => x.lab).filter(Boolean))];
  return (
    <Modal title={`${labText(o)} · ${P(db, o.pid).name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (run((d) => setLabDetails(d, o.id, f)).ok) onClose(); }}>
        <Field label="Supplier (lab)"><input data-autofocus list="dl-labs" value={f.lab} placeholder="e.g. Precision Dental Lab" onChange={(e) => set('lab', e.target.value)} /></Field>
        <datalist id="dl-labs">{labs.map((x) => <option key={x} value={x} />)}</datalist>
        <div className="fgrid">
          <Field label="Expected back on"><input type="date" value={f.expected} onChange={(e) => set('expected', e.target.value)} /></Field>
          <Field label="Supplier’s charge (₹)" hint={o.expenseId ? 'Already added to expenses' : 'Optional. Added to expenses under Lab.'}><input type="number" min="0" step="1" inputMode="numeric" value={f.cost} disabled={!!o.expenseId} onChange={(e) => set('cost', e.target.value)} /></Field>
        </div>
        <button className="btn primary">Save</button>
      </form>
    </Modal>
  );
}

// Work made by an outside supplier: measurement taken → waiting → arrived → fitted.
export default function LabWork() {
  const db = useDb(), t = today();
  const [edit, setEdit] = useState(null), [showDone, setShowDone] = useState(false);
  const late = new Set(labOverdue(db).map((o) => o.id));
  const by = (st) => db.labOrders.filter((o) => o.status === st && P(db, o.pid));
  const waiting = by('waiting').sort((a, b) => (a.expected || '9').localeCompare(b.expected || '9')), arrived = by('arrived'), fitted = by('fitted').sort((a, b) => b.fittedOn.localeCompare(a.fittedOn));
  const record = (p) => ({ label: 'Patient record', onClick: () => go('/patients/' + p.id) });
  const row = (o) => {
    const p = P(db, o.pid), appt = o.status === 'arrived' && fittingBooked(db, o), ready = `Hello ${p.name}, your ${o.name.toLowerCase()} has arrived at ${db.clinic.name}. Please call ${db.clinic.phone} to fix a time for fitting. Thank you.`;
    return (
      <li className="fd" key={o.id} data-lab={o.status}>
        <span className={'tm' + (late.has(o.id) ? ' lt' : '')}>{o.status === 'waiting' ? (late.has(o.id) ? 'Overdue' : o.expected ? dm(o.expected) : '–') : dm(o.status === 'arrived' ? o.arrivedOn : o.fittedOn)}<small>{o.status === 'waiting' ? (late.has(o.id) ? dm(o.expected) : 'expected') : o.status === 'arrived' ? 'arrived' : 'fitted'}</small></span>
        <span className="who2"><b>{p.name}</b> <span className="rs">{labText(o)}</span><span className="al" style={{ color: 'var(--muted)' }}>Measured {fmtD(o.measuredOn)}{o.lab ? ' · ' + o.lab : ' · supplier not noted'}</span></span>
        <span className="st">{appt ? `Fitting ${dm(appt.date)} ${appt.time}` : ''}</span>
        <span className="acts">
          {o.status === 'waiting' && <button type="button" className="btn sm primary" onClick={() => run((d) => markArrived(d, o.id))}>Mark as arrived</button>}
          {o.status === 'arrived' && !appt && <button type="button" className="btn sm primary" onClick={() => setUi({ book: { pid: p.id, reason: `${labText(o)} fitting`, date: t } })}>Book fitting</button>}
          {o.status !== 'fitted' && <Menu label={`More actions for ${p.name}`} items={[
            ...(o.status === 'waiting' ? [{ label: 'Supplier, date and charge', onClick: () => setEdit(o.id) }] : [...contactItems(p, ready), { label: 'Not arrived yet (move back)', onClick: () => run((d) => backToWaitingLab(d, o.id)) }]),
            record(p), { label: 'Cancel this lab item', onClick: () => { if (window.confirm(`Cancel ${labText(o)} for ${p.name}?`)) run((d) => cancelLab(d, o.id)); } }]} />}
        </span>
      </li>
    );
  };
  const eo = edit && db.labOrders.find((o) => o.id === edit);
  return (
    <div className="calm fdesk">
      <div className="ch"><div><h1>Lab work</h1><p className="lede">Crowns, dentures and other work made by a supplier. It appears here when the doctor records “Measurement taken”.</p></div></div>
      <h2 className="grp">Arrived, to be fitted <span>{arrived.length}</span></h2>
      <ul className="rows fdl" data-testid="lab-arrived">{arrived.map(row)}{!arrived.length && <li className="empty-line">Nothing waiting to be fitted.</li>}</ul>
      <h2 className="grp" style={{ marginTop: 28 }}>Waiting for the supplier <span>{waiting.length}</span></h2>
      <ul className="rows fdl" data-testid="lab-waiting">{waiting.map(row)}{!waiting.length && <li className="empty-line">Nothing with a supplier right now.</li>}</ul>
      {fitted.length > 0 && <>
        <button type="button" className="linkbtn" style={{ margin: '14px 0 0' }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} fitted ({fitted.length})</button>
        {showDone && <ul className="rows fdl">{fitted.map(row)}</ul>}
      </>}
      {eo && <Details db={db} o={eo} onClose={() => setEdit(null)} />}
    </div>
  );
}
