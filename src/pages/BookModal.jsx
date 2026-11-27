import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { Field } from '../components/controls.jsx';
import { useDb, useUi, setUi, run } from '../data/store.js';
import { submitBooking, firstFree } from '../data/actions.js';
import { SLOT_TAKEN, findPatients, procOf } from '../data/selectors.js';
import { validateBooking, mobileDigits } from '../logic/validation.js';
import { today, addDays } from '../logic/format.js';
import { SLOTS } from '../data/constants.js';

// Book or move an appointment. Open with setUi({ book: { pid?, reason?, resched?, date? } }).
export default function BookModal() {
  const db = useDb(), { book } = useUi();
  const old = book.resched && db.appointments.find((a) => a.id === book.resched);
  const [f, setF] = useState(() => {
    const date = old?.date || (book.date >= today() ? book.date : addDays(today(), 1)), pid = old?.pid || book.pid || 'new';
    // reason: what the call list said, else the patient's next planned treatment
    return { pid, newName: '', newPhone: '', date, time: old?.time || firstFree(db, date), reason: old?.reason || book.reason || (pid !== 'new' ? procOf(db, pid) : '') };
  });
  const [E, setE] = useState({}), [q, setQ] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const taken = SLOT_TAKEN(db, f.date), past = (s) => f.date === today() && s <= new Date().toTimeString().slice(0, 5);
  const setDate = (d) => setF((x) => ({ ...x, date: d, time: old && d === old.date ? old.time : firstFree(db, d) }));
  const pick = (pid) => setF((x) => ({ ...x, pid, reason: x.reason || (pid !== 'new' ? procOf(db, pid) : '') }));
  const close = () => setUi({ book: null });
  const hits = q.trim().length > 1 ? findPatients(db, q) : null;
  const pts = [...(hits || db.patients)].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
  if (hits && f.pid !== 'new' && !pts.some((p) => p.id === f.pid)) { const cur = db.patients.find((p) => p.id === f.pid); if (cur) pts.unshift(cur); }
  const submit = (e) => {
    e.preventDefault();
    const errs = validateBooking({ ...f, isNew: f.pid === 'new' });
    setE(errs);
    if (Object.keys(errs).length) return;
    if (run((d) => submitBooking(d, f, book.resched)).ok) setUi({ book: null, calDay: f.date });
  };
  return (
    <Modal title={old ? 'Reschedule' : 'Book appointment'} onClose={close}>
      <form onSubmit={submit} noValidate>
        {!old && <Field label="Find patient" hint={hits ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : undefined}><input type="search" data-autofocus placeholder="Name, mobile or Reg. No." value={q} onChange={(e) => { setQ(e.target.value); const h = findPatients(db, e.target.value); if (h.length === 1) pick(h[0].id); }} /></Field>}
        <Field label="Patient"><select value={f.pid} disabled={!!old} onChange={(e) => pick(e.target.value)}><option value="new">New patient</option>{pts.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.reg}</option>)}</select></Field>
        {f.pid === 'new' && (
          <div className="fgrid">
            <Field label="Name" req error={E.n}><input value={f.newName} onChange={(e) => set('newName', e.target.value)} /></Field>
            <Field label="Mobile" req error={E.m}><input type="tel" inputMode="numeric" placeholder="10 digits" value={f.newPhone} onChange={(e) => set('newPhone', mobileDigits(e.target.value))} /></Field>
          </div>
        )}
        <div className="fgrid3">
          <Field label="Date" error={E.d}><input type="date" value={f.date} min={today()} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Time"><select className="slots" value={f.time} onChange={(e) => set('time', e.target.value)}>{SLOTS.map((s) => { const who = s !== old?.time || f.date !== old?.date ? taken.get(s) : null; return <option key={s} value={s} disabled={!!who || past(s)}>{s}{who ? ` · ${who}` : past(s) ? ' · passed' : ''}</option>; })}</select></Field>
          <Field label="Reason"><input value={f.reason} list="dl-reason" placeholder="e.g. Review" onChange={(e) => set('reason', e.target.value)} /></Field>
          <datalist id="dl-reason">{['Review', 'Consultation', ...db.services.filter((s) => s.active).map((s) => s.name)].map((x) => <option key={x} value={x} />)}</datalist>
        </div>
        <button className="btn primary">{old ? 'Move booking' : 'Book'}</button>
      </form>
    </Modal>
  );
}
