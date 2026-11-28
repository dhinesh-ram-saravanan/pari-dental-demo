// Lab work: crowns, dentures, aligners and the like are made by an outside supplier.
// The app only tracks three steps: measurement taken (waiting for the supplier) → arrived → fitted.
import { today, addDays, uid } from './format.js';

export const LAB_STEPS = { waiting: 'Waiting for supplier', arrived: 'Arrived, to be fitted', fitted: 'Fitted', cancelled: 'Cancelled' };
export const labOpen = (db) => db.labOrders.filter((o) => o.status === 'waiting' || o.status === 'arrived');
export const labFor = (db, pid) => labOpen(db).filter((o) => o.pid === pid);
export const labOverdue = (db) => db.labOrders.filter((o) => o.status === 'waiting' && o.expected && o.expected < today());
export const fittingBooked = (db, o) => db.appointments.find((a) => a.pid === o.pid && a.status === 'booked' && a.date >= today());
// Arrived, and the patient has neither a booking nor a place in today's queue: reception should call them.
export const labToCall = (db) => db.labOrders.filter((o) => o.status === 'arrived' && !fittingBooked(db, o) && !db.queue.some((q) => q.pid === o.pid && q.date === today() && q.status !== 'done'));
export const labText = (o) => o.name + (o.teeth?.length ? ' ' + o.teeth.join(',') : '');

export function createLabOrder(db, { pid, svc, teeth, caseId, itemId }) {
  const last = [...db.labOrders].reverse().find((o) => o.svcId === svc.id && o.lab) || [...db.labOrders].reverse().find((o) => o.lab);
  const o = { id: 'l' + uid(), pid, svcId: svc.id, name: svc.name, teeth, caseId, itemId, measuredOn: today(), status: 'waiting', lab: last?.lab || '', expected: addDays(today(), svc.labDays || 7), cost: '', arrivedOn: '', fittedOn: '' };
  db.labOrders.push(o);
  return o;
}
// Reception adds an item by hand, e.g. a measurement taken before the app was in use.
// Nothing is charged here; billing stays with the visit and checkout. → { field: message }
export function labItemErrors(db, f) {
  const E = {};
  if (!db.patients.some((p) => p.id === f.pid)) E.pid = 'Choose the patient';
  if (!db.services.some((s) => s.id === f.svcId)) E.svcId = 'Choose what is being made';
  const bad = (f.teeth || '').split(/[ ,]+/).filter(Boolean).find((n) => !/^([1-4][1-8]|[5-8][1-5])$/.test(n));
  if (bad) E.teeth = `“${bad}” is not a tooth number`;
  if (!f.measuredOn || f.measuredOn > today()) E.measuredOn = 'Use today or an earlier date';
  if (f.expected && f.measuredOn && f.expected < f.measuredOn) E.expected = 'Cannot be before the measurement';
  if (!E.pid && !E.svcId && labOpen(db).some((o) => o.pid === f.pid && o.svcId === f.svcId && o.teeth.join() === (f.teeth || '').split(/[ ,]+/).filter(Boolean).join())) E.svcId = 'This is already on the list for this patient';
  return E;
}
export function addLabItem(db, f) {
  if (Object.keys(labItemErrors(db, f)).length) return { ok: false, msg: 'Please check the highlighted fields' };
  const s = db.services.find((x) => x.id === f.svcId);
  const o = { id: 'l' + uid(), pid: f.pid, svcId: s.id, name: s.name, teeth: (f.teeth || '').split(/[ ,]+/).filter(Boolean), caseId: null, itemId: null, measuredOn: f.measuredOn, status: 'waiting', lab: (f.lab || '').trim(), expected: f.expected || '', cost: '', arrivedOn: '', fittedOn: '', byHand: true };
  db.labOrders.push(o);
  return { ok: true, id: o.id, msg: `${labText(o)} added for ${db.patients.find((p) => p.id === f.pid).name}` };
}
const find = (db, id) => db.labOrders.find((o) => o.id === id);
// Supplier name, expected date and what the supplier charges (booked once as a Lab expense).
export function setLabDetails(db, id, { lab, expected, cost }) {
  const o = find(db, id);
  if (!o) return { ok: false, msg: 'That lab item was changed on another screen' };
  Object.assign(o, { lab: (lab || '').trim(), expected: expected || '' });
  if (cost !== '' && cost != null && +cost > 0 && !o.expenseId) {
    o.expenseId = uid(); o.cost = +cost;
    db.expenses.push({ id: o.expenseId, date: today(), category: 'Lab', item: `${labText(o)} · lab work`, amount: +cost, vendor: o.lab });
  }
  return { ok: true, msg: 'Lab details saved' };
}
export function markArrived(db, id) {
  const o = find(db, id);
  if (!o || o.status !== 'waiting') return { ok: false, msg: 'That lab item was changed on another screen' };
  Object.assign(o, { status: 'arrived', arrivedOn: today(), calledOn: '' });
  return { ok: true, msg: `${labText(o)} marked as arrived. Call the patient for fitting.` };
}
export function backToWaitingLab(db, id) { const o = find(db, id); if (o?.status === 'arrived') Object.assign(o, { status: 'waiting', arrivedOn: '' }); return { ok: !!o }; }
export function cancelLab(db, id) { const o = find(db, id); if (o) o.status = 'cancelled'; return { ok: !!o, msg: 'Lab item cancelled' }; }
