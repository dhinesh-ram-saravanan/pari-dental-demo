import { today, addDays } from './format.js';

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
const V = (db, id) => db.visits.find((v) => v.id === id);
export const markCalled = (db, id) => Object.assign(V(db, id), { fu: 'contacted', calledOn: today() });
export const moveBack = (db, id) => Object.assign(V(db, id), { fu: 'pending', calledOn: null });
export const closeFU = (db, id) => Object.assign(V(db, id), { fu: 'done' });
// Booking a patient clears them from both call lists.
export const markBooked = (db, pid) => db.visits.filter((v) => v.pid === pid && v.fu && v.fu !== 'done').forEach((v) => { v.fu = 'booked'; });
