import { useState } from 'react';
import Menu from '../components/Menu.jsx';
import { cancelAppt } from './FrontDesk.jsx';
import { useDb, useUi, setUi, run, update, toast } from '../data/store.js';
import { P, contactItems, remind } from '../data/selectors.js';
import { addToQueue } from '../data/actions.js';
import { callLists, markCalled, moveBack, closeFU } from '../logic/followups.js';
import { today, addDays, fmtS } from '../logic/format.js';

const ST = { 'checked-in': ['s-wt', 'Arrived'], visited: ['s-ok', 'Seen'] };

export default function Calendar() {
  const db = useDb(), ui = useUi(), t = today();
  const [ws, setWs] = useState(t);
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const day = ui.calDay && ui.calDay >= t ? ui.calDay : days[0];
  const strip = days.includes(day) ? days : [...Array(7)].map((_, i) => addDays(day, i));
  const appts = db.appointments.filter((a) => a.date === day && a.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
  const { toCall, called } = callLists(db);
  const shift = (n) => { const s = addDays(strip[0], n) < t ? t : addDays(strip[0], n); setWs(s); setUi({ calDay: s }); };
  const fuRow = (v, isCalled) => {
    const p = P(db, v.pid), od = v.nextVisit < t, dm = (d) => fmtS(d).slice(0, 5), msg = remind(db, p, v.nextVisit, v.nextReason);
    const closeIt = { label: 'No visit needed', onClick: () => { update((d) => closeFU(d, v.id)); toast('Removed from follow-ups'); } };
    return (
      <li className="fd" key={v.id}>
        <span className={'tm' + (od && !isCalled ? ' lt' : '')}>{isCalled ? (v.calledOn ? dm(v.calledOn) : '–') : od ? 'Overdue' : v.nextVisit === t ? 'Today' : dm(v.nextVisit)}{!isCalled && od && <small>{dm(v.nextVisit)}</small>}{isCalled && <small>called</small>}</span>
        <span className="who2"><b>{p.name}</b> <span className="rs">{v.nextReason || 'Check-up'}</span></span><span />
        <span className="acts">
          <button type="button" className={'btn sm' + (isCalled ? ' primary' : '')} onClick={() => setUi({ book: { pid: p.id, reason: v.nextReason } })}>Book</button>
          <Menu label={`More actions for ${p.name}`} items={isCalled
            ? [...contactItems(p, msg, ' again'), { label: 'Move back to “To call”', onClick: () => update((d) => moveBack(d, v.id)) }, closeIt]
            : [...contactItems(p, msg), { label: 'Mark as called', onClick: () => { update((d) => markCalled(d, v.id)); toast('Moved to “Called, not booked yet”'); } }, closeIt]} />
        </span>
      </li>
    );
  };
  return (
    <div className="calm fdesk">
      <div className="ch"><div><h1>Calendar</h1><p className="lede">Bookings and patients to call back.</p></div><button type="button" className="btn primary" onClick={() => setUi({ book: { date: day } })}>+ Book appointment</button></div>
      <div className="twocol">
        <section aria-label="Bookings"><h2 className="grp">Bookings <span>{appts.length}</span></h2>
          <div className="week">
            <button type="button" className="wkarr" aria-label="Previous week" disabled={strip[0] <= t} onClick={() => shift(-7)}>‹</button>
            {strip.map((d) => { const n = db.appointments.filter((a) => a.date === d && a.status === 'booked').length, x = new Date(d + 'T00:00:00'); return <button type="button" key={d} className={'wkd' + (d === day ? ' on' : '')} aria-pressed={d === day} onClick={() => setUi({ calDay: d })}><span>{d === t ? 'Today' : x.toLocaleDateString('en-IN', { weekday: 'short' })}</span><b>{x.getDate()}</b><small>{n || ''}</small></button>; })}
            <button type="button" className="wkarr" aria-label="Next week" onClick={() => shift(7)}>›</button>
          </div>
          <ul className="rows fdl" data-testid="bookings">
            {appts.map((a) => { const p = P(db, a.pid); return (
              <li className="fd" key={a.id}>
                <span className="tm">{a.time}</span><span className="who2"><b>{p.name}</b> <span className="rs">{a.reason || 'Appointment'}</span></span>
                <span>{ST[a.status] && <span className={'st ' + ST[a.status][0]}>{ST[a.status][1]}</span>}</span>
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
