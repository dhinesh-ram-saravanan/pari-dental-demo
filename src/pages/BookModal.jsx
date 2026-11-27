import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { Field } from '../components/controls.jsx';
import { useDb, useUi, setUi, run } from '../data/store.js';
import { submitBooking } from '../data/actions.js';
import { validateBooking, mobileDigits } from '../logic/validation.js';
import { today, addDays } from '../logic/format.js';
import { SLOTS } from '../data/constants.js';

// Book or move an appointment. Open with setUi({ book: { pid?, reason?, resched?, date? } }).
export default function BookModal() {
  const db = useDb(), { book } = useUi();
  const old = book.resched && db.appointments.find((a) => a.id === book.resched);
  const [f, setF] = useState({ pid: old?.pid || book.pid || 'new', newName: '', newPhone: '', date: old?.date || (book.date > today() ? book.date : addDays(today(), 1)), time: old?.time || SLOTS[0], reason: old?.reason || book.reason || '' });
  const [E, setE] = useState({});
  const set = (k, v) => setF({ ...f, [k]: v });
  const close = () => setUi({ book: null });
  const pts = [...db.patients].sort((a, b) => a.name.localeCompare(b.name));
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
        <Field label="Patient"><select value={f.pid} disabled={!!old} onChange={(e) => set('pid', e.target.value)}><option value="new">New patient</option>{pts.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.reg}</option>)}</select></Field>
        {f.pid === 'new' && (
          <div className="fgrid">
            <Field label="Name" req error={E.n}><input value={f.newName} onChange={(e) => set('newName', e.target.value)} /></Field>
            <Field label="Mobile" req error={E.m}><input type="tel" inputMode="numeric" placeholder="10 digits" value={f.newPhone} onChange={(e) => set('newPhone', mobileDigits(e.target.value))} /></Field>
          </div>
        )}
        <div className="fgrid3">
          <Field label="Date" error={E.d}><input type="date" value={f.date} min={today()} onChange={(e) => set('date', e.target.value)} required /></Field>
          <Field label="Time"><select value={f.time} onChange={(e) => set('time', e.target.value)}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Reason"><input value={f.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
        </div>
        <button className="btn primary">{old ? 'Move booking' : 'Book'}</button>
      </form>
    </Modal>
  );
}
