import { useState } from 'react';
import Menu from '../components/Menu.jsx';
import Notices from '../components/Notices.jsx';
import { useDb, useUi, setUi, run, go } from '../data/store.js';
import { ReceiptPrint } from '../components/Prints.jsx';
import { P, todayRows, alertsOf, procOf, frontNotices, contactItems, findPatients, remind } from '../data/selectors.js';
import { addToQueue, sendIn, coInit, removeFromQueue, backToWaiting, cancelBooking } from '../data/actions.js';
import { bal } from '../logic/balance.js';
import { today, addDays, nowT, inr, sum, longDay } from '../logic/format.js';

const ST = { notyet: ['s-bk', 'Booked'], waiting: ['s-wt', 'Waiting'], in: ['s-dr', 'With doctor'], checkout: ['s-py', 'To pay'], done: ['s-ok', 'Done'] };
export const cancelAppt = (id) => { if (window.confirm('Cancel this appointment? The patient goes back on the call list if a visit is still due.')) run((d) => cancelBooking(d, id)); };

export default function FrontDesk() {
  const db = useDb(), ui = useUi();
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);
  const rows = todayRows(db), cur = rows.find((r) => r.st === 'in'), nxt = rows.filter((r) => r.st === 'waiting').sort((a, b) => a.token - b.token)[0];
  const order = { checkout: 0, in: 1, waiting: 2, notyet: 3, done: 4 };
  const active = rows.filter((r) => r.st !== 'done').sort((a, b) => order[a.st] - order[b.st] || (a.st === 'waiting' ? a.token - b.token : a.time.localeCompare(b.time)));
  const done = rows.filter((r) => r.st === 'done');
  const openCo = (qid) => setUi({ co: ui.coDrafts[qid] || coInit(db, qid) }); // a half-filled checkout is kept
  // Whatever was typed in the search box is carried into the new-patient form.
  const register = () => { const t = search.trim(), dg = t.replace(/\D/g, ''); setUi({ regPrefill: t ? { name: t.replace(/[^A-Za-z .']/g, '').trim(), mobile: dg.length >= 6 ? dg.slice(-10) : '' } : null }); go('/register'); };
  const record = (p) => ({ label: 'Patient record', onClick: () => go('/patients/' + p.id) });
  const s = search.trim().toLowerCase();
  const all = findPatients(db, search), found = all.slice(0, 6);
  const onNotice = (a) => ({ review: () => go('/register/' + a.arg), checkout: () => openCo(a.arg), go: () => go(a.arg),
    dues: () => { setUi({ treg: { pay: 'owes', from: addDays(today(), -365), to: today() } }); go('/patients/treatment'); },
    tomorrow: () => { setUi({ calDay: addDays(today(), 1) }); go('/calendar'); } }[a.do]());

  const row = (r) => {
    const p = P(db, r.pid), late = r.st === 'notyet' && r.time < nowT(), [c, l] = ST[r.st], al = alertsOf(p);
    let act = null, items = [record(p)];
    if (r.st === 'notyet') {
      act = <button type="button" className="btn sm primary" onClick={() => run((d) => addToQueue(d, p.id, 'Appointment', r.id))}>Check in</button>;
      items = [...contactItems(p, remind(db, p, today(), r.reason, r.time)), { label: 'Reschedule', onClick: () => setUi({ book: { resched: r.id } }) }, { label: 'Cancel booking', onClick: () => cancelAppt(r.id) }];
    } else if (r.st === 'waiting') {
      act = <>{!p.verified && <button type="button" className="btn sm" onClick={() => go('/register/' + p.id)}>Check form</button>}{nxt?.id === r.id && !cur && <button type="button" className="btn sm primary" onClick={() => run((d) => sendIn(d, r.id))}>Send in</button>}</>;
      items = [{ label: 'Send in now', onClick: () => run((d) => sendIn(d, r.id)) }, record(p), { label: 'Remove from today’s queue', onClick: () => { if (window.confirm(`Remove ${p.name} from today’s queue?`)) run((d) => removeFromQueue(d, r.id)); } }];
    } else if (r.st === 'in') {
      items = [record(p), { label: 'Move back to waiting', onClick: () => run((d) => backToWaiting(d, r.id)) }];
    } else if (r.st === 'checkout') act = <button type="button" className="btn sm primary" onClick={() => openCo(r.id)}>Checkout</button>;
    else if (r.st === 'done') {
      const pd = sum(db.payments.filter((x) => x.pid === p.id && x.date === today()), (x) => x.amount);
      act = <span className="sm muted">{pd ? inr(pd) + ' paid' : 'No payment'}</span>;
      const v = db.visits.find((x) => x.id === db.queue.find((q) => q.id === r.id)?.visitId) || db.visits.find((x) => x.pid === p.id && x.date === today());
      items = [{ label: 'Book next visit', onClick: () => setUi({ book: { pid: p.id } }) }, ...(v ? [{ label: 'Print receipt', onClick: () => setUi({ print: <ReceiptPrint db={db} visit={v} /> }) }] : []), record(p)];
    }
    return (
      <li className="fd" key={r.k + r.id} data-status={r.st}>
        <span className="tm">{r.time}{r.k === 'q' && <small>#{r.token}</small>}</span>
        <span className="who2"><b>{p.name}</b> <span className="rs">{r.reason}</span>{!p.verified && <span className="al" style={{ color: 'var(--warn)' }}>New form</span>}{al.length > 0 && <span className="al">{al.join(', ')}</span>}</span>
        <span className={'st ' + (late ? 's-lt' : c)}>{late ? 'Late' : l}</span>
        <span className="acts">{act}<Menu items={items} label={`More actions for ${p.name}`} /></span>
      </li>
    );
  };

  return (
    <div className="calm fdesk">
      <div className="ch">
        <div><h1>Front desk</h1><p className="lede">{longDay()}</p></div>
        <div className="row-actions">
          <button type="button" className="btn primary" onClick={register}>+ New patient</button>
          <Menu label="More front desk actions" items={[{ label: 'Patient tablet', onClick: () => go('/tablet') }, { label: 'QR code for the form', onClick: () => setUi({ qr: true }) }, { label: 'Book an appointment', onClick: () => setUi({ book: {} }) }]} />
        </div>
      </div>
      <div className="searchbig"><input type="search" placeholder="Returning patient? Type name, mobile or Reg. No." value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" aria-label="Find a patient" /></div>
      {s.length > 1 && (
        <div className="list" style={{ margin: '6px 0 4px' }} data-testid="search-results">
          {found.map((p) => (
            <div className="li" key={p.id}>
              <div className="when">{p.reg}</div>
              <div><b>{p.name}</b><div className="what">{p.mobile}{bal(db, p.id) > 0 && <> · <span style={{ color: 'var(--bad)' }}>owes {inr(bal(db, p.id))}</span></>} · {procOf(db, p.id)}</div></div>
              <div className="row-actions">
                <button type="button" className="btn sm ghost" onClick={() => go('/patients/' + p.id)}>Record</button>
                <button type="button" className="btn sm ghost" onClick={() => setUi({ book: { pid: p.id } })}>Book</button>
                <button type="button" className="btn sm primary" onClick={() => { run((d) => addToQueue(d, p.id, 'Walk-in')); setSearch(''); }}>Add to today</button>
              </div>
            </div>
          ))}
          {all.length > 6 && <div className="li"><span /><span className="sm muted">Showing 6 of {all.length}. Keep typing to narrow it down.</span><span /></div>}
          {!found.length && <div className="li"><span /><span className="muted">No match.</span><button type="button" className="btn sm primary" onClick={register}>Register “{search.trim()}” as a new patient</button></div>}
        </div>
      )}
      {cur
        ? <div className="drbar busy" data-testid="doctor-bar"><span><i />With the doctor: <b>{P(db, cur.pid).name}</b> since {cur.inTime || cur.time} · token {cur.token} · {cur.reason}</span></div>
        : <div className="drbar free" data-testid="doctor-bar"><span><i />Doctor is free{nxt ? <> · next: <b>{P(db, nxt.pid).name}</b> (token {nxt.token})</> : ' · no one waiting'}</span>{nxt && <button type="button" className="btn sm brass" onClick={() => run((d) => sendIn(d, nxt.id))}>Send in</button>}</div>}
      <Notices list={frontNotices(db)} cap={3} onAct={onNotice} />
      <h2 className="grp">Today <span>{rows.length}</span></h2>
      <ul className="rows fdl" data-testid="today-list">{active.map(row)}{!active.length && <li className="empty-line">No one yet today.</li>}</ul>
      {done.length > 0 && (
        <>
          <button type="button" className="linkbtn" style={{ margin: '10px 0 0' }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} finished ({done.length})</button>
          {showDone && <ul className="rows fdl">{done.map(row)}</ul>}
        </>
      )}
    </div>
  );
}
