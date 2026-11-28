import { today, addDays } from './format.js';
import { labToCall, labText } from './lab.js';

// A visit carries its follow-up: fu = pending (to call) → contacted (called) → booked / done (closed).
export const openFU = (db) => db.visits.filter((v) => v.nextVisit && v.fu && v.fu !== 'done');
// "Booked" only counts while the patient still has a booking ahead. A cancelled or missed
// appointment puts them back on the call list instead of losing them.
const upcoming = (db) => new Set(db.appointments.filter((a) => a.status === 'booked' && a.date >= today()).map((a) => a.pid));
const waitingForCall = (db) => { const up = upcoming(db); return openFU(db).filter((v) => !(v.fu === 'booked' && up.has(v.pid))); };
export const dueFU = (db) => waitingForCall(db).filter((v) => v.nextVisit <= today());

export function callLists(db) {
  const open = waitingForCall(db).filter((v) => v.nextVisit <= addDays(today(), 7));
  return {
    toCall: open.filter((v) => v.fu !== 'contacted').sort((a, b) => a.nextVisit.localeCompare(b.nextVisit)),
    called: open.filter((v) => v.fu === 'contacted').sort((a, b) => (b.calledOn || '').localeCompare(a.calledOn || '')),
  };
}
// Everyone reception has to ring, from three sources, one line per patient:
//   lab    – their crown/denture has arrived and no fitting is booked
//   missed – they had a booking on an earlier day and did not come
//   fu     – the doctor asked for a next visit and none is booked
// → { toCall, called }, each entry { key, kind, id, pid, reason, due, calledOn }
export function callEntries(db) {
  const t = today(), seen = new Set(), out = [];
  const add = (e) => { if (!seen.has(e.pid) && db.patients.some((p) => p.id === e.pid)) { seen.add(e.pid); out.push(e); } };
  labToCall(db).forEach((o) => add({ key: 'lab:' + o.id, kind: 'lab', id: o.id, pid: o.pid, reason: `${labText(o)} has arrived, book the fitting`, book: `${labText(o)} fitting`, due: o.arrivedOn || t, calledOn: o.calledOn || '' }));
  db.appointments.filter((a) => a.status === 'booked' && a.date < t).sort((a, b) => b.date.localeCompare(a.date))
    .forEach((a) => add({ key: 'missed:' + a.id, kind: 'missed', id: a.id, pid: a.pid, reason: `Did not come on ${a.date.slice(8)}/${a.date.slice(5, 7)}${a.reason ? ' · ' + a.reason : ''}`, book: a.reason, due: a.date, calledOn: a.calledOn || '' }));
  // no point ringing someone whose crown is still with the supplier: they are called when it arrives
  const atLab = new Set(db.labOrders.filter((o) => o.status === 'waiting').map((o) => o.pid));
  waitingForCall(db).filter((v) => v.nextVisit <= addDays(t, 7) && !atLab.has(v.pid)).sort((a, b) => a.nextVisit.localeCompare(b.nextVisit))
    .forEach((v) => add({ key: 'fu:' + v.id, kind: 'fu', id: v.id, pid: v.pid, reason: v.nextReason || 'Check-up', book: v.nextReason, due: v.nextVisit, calledOn: v.fu === 'contacted' ? v.calledOn || t : '' }));
  const first = { lab: 0, missed: 1, fu: 2 };
  return {
    toCall: out.filter((e) => !e.calledOn).sort((a, b) => first[a.kind] - first[b.kind] || a.due.localeCompare(b.due)),
    called: out.filter((e) => e.calledOn).sort((a, b) => b.calledOn.localeCompare(a.calledOn)),
  };
}
// Entries reception should act on now (not ones due later this week).
export const callsDue = (db) => callEntries(db).toCall.filter((e) => e.due <= today());
const target = (db, e) => (e.kind === 'fu' ? db.visits : e.kind === 'lab' ? db.labOrders : db.appointments).find((x) => x.id === e.id);
export function entryCalled(db, e, on = true) {
  const x = target(db, e);
  if (!x) return;
  if (e.kind === 'fu') Object.assign(x, on ? { fu: 'contacted', calledOn: today() } : { fu: 'pending', calledOn: null });
  else x.calledOn = on ? today() : '';
}
// "No visit needed": the follow-up is closed, or the missed booking is written off. (Lab items are closed from Lab work.)
export function entryClose(db, e) {
  const x = target(db, e);
  if (!x) return;
  if (e.kind === 'fu') x.fu = 'done'; else if (e.kind === 'missed') x.status = 'missed';
}

const V = (db, id) => db.visits.find((v) => v.id === id);
export const markCalled = (db, id) => Object.assign(V(db, id), { fu: 'contacted', calledOn: today() });
export const moveBack = (db, id) => Object.assign(V(db, id), { fu: 'pending', calledOn: null });
export const closeFU = (db, id) => Object.assign(V(db, id), { fu: 'done' });
// Booking a patient clears them from both call lists.
export const markBooked = (db, pid) => db.visits.filter((v) => v.pid === pid && v.fu && v.fu !== 'done').forEach((v) => { v.fu = 'booked'; });
