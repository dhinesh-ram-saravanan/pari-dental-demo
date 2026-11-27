import { useState } from 'react';
import Menu from '../components/Menu.jsx';
import Modal from '../components/Modal.jsx';
import { Field } from '../components/controls.jsx';
import { useDb, setUi, run, go } from '../data/store.js';
import { P, contactItems, findPatients } from '../data/selectors.js';
import { labOverdue, fittingBooked, labText, setLabDetails, markArrived, backToWaitingLab, cancelLab, labItemErrors, addLabItem } from '../logic/lab.js';
import { today, addDays, fmtD, fmtS } from '../logic/format.js';

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

function AddItem({ db, onClose }) {
  const labs = [...new Set(db.labOrders.map((x) => x.lab).filter(Boolean))], made = db.services.filter((s) => s.lab && s.active);
  const [f, setF] = useState({ pid: '', svcId: made[0]?.id || '', teeth: '', measuredOn: today(), lab: labs.at(-1) || '', expected: addDays(today(), 7) });
  const [E, setE] = useState({}), [q, setQ] = useState('');
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setE((e) => ({ ...e, [k]: undefined })); };
  const hits = q.trim().length > 1 ? findPatients(db, q) : null, pts = [...(hits || db.patients)].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
  const submit = (e) => { e.preventDefault(); const errs = labItemErrors(db, f); setE(errs); if (!Object.keys(errs).length && run((d) => addLabItem(d, f)).ok) onClose(); };
  return (
    <Modal title="Add a lab item" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="sm muted" style={{ marginTop: 0 }}>For work already with a supplier that the doctor did not record here. Nothing is charged; billing stays with the visit.</p>
        <Field label="Find patient" hint={hits ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : undefined}><input type="search" data-autofocus placeholder="Name, mobile or Reg. No." value={q} onChange={(e) => { setQ(e.target.value); const h = findPatients(db, e.target.value); if (h.length === 1) set('pid', h[0].id); }} /></Field>
        <Field label="Patient" req error={E.pid}><select value={f.pid} onChange={(e) => set('pid', e.target.value)}><option value="">Choose a patient</option>{pts.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.reg}</option>)}</select></Field>
        <div className="fgrid">
          <Field label="What is being made" req error={E.svcId} hint="Mark more treatments as lab work in Clinic › Prices"><select value={f.svcId} onChange={(e) => set('svcId', e.target.value)}>{made.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Teeth" error={E.teeth}><input value={f.teeth} placeholder="e.g. 36" onChange={(e) => set('teeth', e.target.value)} /></Field>
          <Field label="Measurement taken on" req error={E.measuredOn}><input type="date" max={today()} value={f.measuredOn} onChange={(e) => set('measuredOn', e.target.value)} /></Field>
          <Field label="Expected back on" error={E.expected}><input type="date" value={f.expected} onChange={(e) => set('expected', e.target.value)} /></Field>
        </div>
        <Field label="Supplier (lab)"><input list="dl-labs2" value={f.lab} placeholder="e.g. Precision Dental Lab" onChange={(e) => set('lab', e.target.value)} /></Field>
        <datalist id="dl-labs2">{labs.map((x) => <option key={x} value={x} />)}</datalist>
        <button className="btn primary">Add to lab work</button>
      </form>
    </Modal>
  );
}

// Work made by an outside supplier: measurement taken → waiting → arrived → fitted.
export default function LabWork() {
  const db = useDb(), t = today();
  const [edit, setEdit] = useState(null), [showDone, setShowDone] = useState(false), [adding, setAdding] = useState(false);
  const late = new Set(labOverdue(db).map((o) => o.id));
  const by = (st) => db.labOrders.filter((o) => o.status === st && P(db, o.pid));
  const waiting = by('waiting').sort((a, b) => (a.expected || '9').localeCompare(b.expected || '9')), arrived = by('arrived'), fitted = by('fitted').sort((a, b) => b.fittedOn.localeCompare(a.fittedOn));
  const record = (p) => ({ label: 'Patient record', onClick: () => go('/patients/' + p.id) });
  const row = (o) => {
    const p = P(db, o.pid), appt = o.status === 'arrived' && fittingBooked(db, o), ready = `Hello ${p.name}, your ${o.name.toLowerCase()} has arrived at ${db.clinic.name}. Please call ${db.clinic.phone} to fix a time for fitting. Thank you.`;
    return (
      <li className="fd" key={o.id} data-lab={o.status}>
        <span className={'tm' + (late.has(o.id) ? ' lt' : '')}>{o.status === 'waiting' ? (late.has(o.id) ? 'Overdue' : o.expected ? dm(o.expected) : '–') : dm(o.status === 'arrived' ? o.arrivedOn : o.fittedOn)}<small>{o.status === 'waiting' ? (late.has(o.id) ? dm(o.expected) : 'expected') : o.status === 'arrived' ? 'arrived' : 'fitted'}</small></span>
        <span className="who2"><b>{p.name}</b> <span className="rs">{labText(o)}</span><span className="al" style={{ color: 'var(--muted)' }}>Measured {fmtD(o.measuredOn)}{o.lab ? ' · ' + o.lab : ' · supplier not noted'}{o.byHand ? ' · added at the desk' : ''}</span></span>
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
      <div className="ch"><div><h1>Lab work</h1><p className="lede">Crowns, dentures and other work made by a supplier. It appears here when the doctor records “Measurement taken”.</p></div><button type="button" className="btn primary" onClick={() => setAdding(true)}>+ Lab item</button></div>
      <h2 className="grp">Arrived, to be fitted <span>{arrived.length}</span></h2>
      <ul className="rows fdl" data-testid="lab-arrived">{arrived.map(row)}{!arrived.length && <li className="empty-line">Nothing waiting to be fitted.</li>}</ul>
      <h2 className="grp" style={{ marginTop: 28 }}>Waiting for the supplier <span>{waiting.length}</span></h2>
      <ul className="rows fdl" data-testid="lab-waiting">{waiting.map(row)}{!waiting.length && <li className="empty-line">Nothing with a supplier right now.</li>}</ul>
      {fitted.length > 0 && <>
        <button type="button" className="linkbtn" style={{ margin: '14px 0 0' }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} fitted ({fitted.length})</button>
        {showDone && <ul className="rows fdl">{fitted.map(row)}</ul>}
      </>}
      {eo && <Details db={db} o={eo} onClose={() => setEdit(null)} />}
      {adding && <AddItem db={db} onClose={() => setAdding(false)} />}
    </div>
  );
}
