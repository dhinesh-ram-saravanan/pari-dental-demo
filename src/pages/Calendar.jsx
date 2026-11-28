import { useState } from 'react';
import Menu from '../components/Menu.jsx';
import { cancelAppt } from './FrontDesk.jsx';
import { useDb, useUi, setUi, run, update, toast, go } from '../data/store.js';
import { P, contactItems, remind } from '../data/selectors.js';
import { addToQueue } from '../data/actions.js';
import { callEntries, entryCalled, entryClose } from '../logic/followups.js';
import { today, addDays, fmtS } from '../logic/format.js';

const ST = { 'checked-in': ['s-wt', 'Arrived'], visited: ['s-ok', 'Seen'] };

export default function Calendar() {
  const db = useDb(), ui = useUi(), t = today();
  const [ws, setWs] = useState(t);
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const day = ui.calDay || days[0]; // earlier days can be opened to see who did not come
  const strip = days.includes(day) ? days : [...Array(7)].map((_, i) => addDays(day, i));
  const appts = db.appointments.filter((a) => a.date === day && a.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
  const { toCall, called } = callEntries(db);
  const shift = (n) => { const s = addDays(strip[0], n); setWs(s); setUi({ calDay: s }); };
  // One row per patient to ring: lab work arrived, a missed booking, or a follow-up the doctor asked for.
  const fuRow = (e, isCalled) => {
    const p = P(db, e.pid), od = e.kind !== 'lab' && e.due < t, dm = (d) => fmtS(d).slice(0, 5);
    const msg = e.kind === 'lab' ? `Hello ${p.name}, your ${e.book.replace(' fitting', '').toLowerCase()} has arrived at ${db.clinic.name}. Please call ${db.clinic.phone} to fix a time for fitting. Thank you.` : remind(db, p, e.kind === 'missed' ? t : e.due, e.book);
    const closeIt = e.kind === 'lab' ? { label: 'Open lab work', onClick: () => go('/lab') } : { label: 'No visit needed', onClick: () => { update((d) => entryClose(d, e)); toast('Removed from the call list'); } };
    // a missed booking is moved to a new slot; the others get a fresh booking with the reason filled in
    const book = () => setUi({ book: e.kind === 'missed' ? { resched: e.id } : { pid: p.id, reason: e.book } });
    return (
      <li className="fd" key={e.key} data-kind={e.kind}>
        <span className={'tm' + (od && !isCalled ? ' lt' : '')}>{isCalled ? dm(e.calledOn) : e.kind === 'lab' ? 'Lab' : e.kind === 'missed' ? 'Missed' : od ? 'Overdue' : e.due === t ? 'Today' : dm(e.due)}{!isCalled && (od || e.kind === 'lab') && <small>{e.kind === 'lab' ? 'arrived' : dm(e.due)}</small>}{isCalled && <small>called</small>}</span>
        <span className="who2"><b>{p.name}</b> <span className="rs">{e.reason}</span></span><span />
        <span className="acts">
          <button type="button" className={'btn sm' + (isCalled || e.kind === 'lab' ? ' primary' : '')} onClick={book}>{e.kind === 'lab' ? 'Book fitting' : e.kind === 'missed' ? 'Rebook' : 'Book'}</button>
          <Menu label={`More actions for ${p.name}`} items={isCalled
            ? [...contactItems(p, msg, ' again'), { label: 'Move back to “To call”', onClick: () => update((d) => entryCalled(d, e, false)) }, closeIt]
            : [...contactItems(p, msg), { label: 'Mark as called', onClick: () => { update((d) => entryCalled(d, e)); toast('Moved to “Called, not booked yet”'); } }, closeIt]} />
        </span>
      </li>
    );
  };
  return (
    <div className="calm fdesk">
      <div className="ch"><div><h1>Calendar</h1><p className="lede">Bookings and patients to call back.</p></div><div className="row-actions">{day !== t && <button type="button" className="btn ghost" onClick={() => { setWs(t); setUi({ calDay: t }); }}>Today</button>}<button type="button" className="btn primary" onClick={() => setUi({ book: { date: day } })}>+ Book appointment</button></div></div>
      <div className="twocol">
        <section aria-label="Bookings"><h2 className="grp">Bookings <span>{appts.length}</span></h2>
          <div className="week">
            <button type="button" className="wkarr" aria-label="Previous week" onClick={() => shift(-7)}>‹</button>
            {strip.map((d) => { const n = db.appointments.filter((a) => a.date === d && a.status === 'booked').length, x = new Date(d + 'T00:00:00'); return <button type="button" key={d} className={'wkd' + (d === day ? ' on' : '')} aria-pressed={d === day} onClick={() => setUi({ calDay: d })}><span>{d === t ? 'Today' : x.toLocaleDateString('en-IN', { weekday: 'short' })}</span><b>{x.getDate()}</b><small>{n || ''}</small></button>; })}
            <button type="button" className="wkarr" aria-label="Next week" onClick={() => shift(7)}>›</button>
          </div>
          <ul className="rows fdl" data-testid="bookings">
            {appts.map((a) => { const p = P(db, a.pid); return (
              <li className="fd" key={a.id}>
                <span className="tm">{a.time}</span><span className="who2"><b>{p.name}</b> <span className="rs">{a.reason || 'Appointment'}</span></span>
                <span>{ST[a.status] ? <span className={'st ' + ST[a.status][0]}>{ST[a.status][1]}</span> : a.date < t ? <span className="st s-lt">Did not come</span> : null}</span>
                <span className="acts">
                  {a.status === 'booked' && a.date === t && <button type="button" className="btn sm primary" onClick={() => run((d) => addToQueue(d, p.id, 'Appointment', a.id))}>Check in</button>}
                  {a.status === 'booked' && <Menu label={`More actions for ${p.name}`} items={[...contactItems(p, remind(db, p, a.date, a.reason, a.time)), { label: 'Reschedule', onClick: () => setUi({ book: { resched: a.id } }) }, { label: 'Cancel booking', onClick: () => cancelAppt(a.id) }]} />}
                </span>
              </li>
            ); })}
            {!appts.length && <li className="empty-line">No bookings on this day.</li>}
          </ul>
        </section>
        <section>
          <h2 className="grp">To call <span>{toCall.length}</span></h2>
          <ul className="rows fdl" data-testid="to-call">{toCall.map((v) => fuRow(v, false))}{!toCall.length && <li className="empty-line">No one to call.</li>}</ul>
          <h2 className="grp" style={{ marginTop: 28 }}>Called, not booked yet <span>{called.length}</span></h2>
          <ul className="rows fdl" data-testid="called">{called.map((v) => fuRow(v, true))}{!called.length && <li className="empty-line">Nobody waiting to book.</li>}</ul>
        </section>
      </div>
    </div>
  );
}
