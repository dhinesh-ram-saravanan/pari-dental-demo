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
  Object.assign(o, { status: 'arrived', arrivedOn: today() });
  return { ok: true, msg: `${labText(o)} marked as arrived. Call the patient for fitting.` };
}
export function backToWaitingLab(db, id) { const o = find(db, id); if (o?.status === 'arrived') Object.assign(o, { status: 'waiting', arrivedOn: '' }); return { ok: !!o }; }
export function cancelLab(db, id) { const o = find(db, id); if (o) o.status = 'cancelled'; return { ok: !!o, msg: 'Lab item cancelled' }; }
