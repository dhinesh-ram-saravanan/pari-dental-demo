import { sum } from './format.js';

export const paidOf = (db, pid) => sum(db.payments.filter((x) => x.pid === pid), (x) => x.amount);
export const billedOf = (db, pid) => sum(db.visits.filter((v) => v.pid === pid), (v) => v.total);
export const bal = (db, pid) => billedOf(db, pid) - paidOf(db, pid);
// What the patient owed before this visit was charged.
export const balBefore = (db, pid, visitId) => bal(db, pid) - sum(db.visits.filter((v) => v.id === visitId), (v) => v.total);
// Balance as at the end of a given day.
export const balOn = (db, pid, day) =>
  sum(db.visits.filter((v) => v.pid === pid && v.date <= day), (v) => v.total) -
  sum(db.payments.filter((x) => x.pid === pid && x.date <= day), (x) => x.amount);
export const owing = (db) => db.patients.filter((p) => bal(db, p.id) > 0);
export const totalDues = (db) => sum(owing(db), (p) => bal(db, p.id));

const svcText = (v) => v.services.map((s) => (s.teeth?.length ? s.teeth.join(', ') + ' ' : '') + s.name).join(', ');

// The paper record sheet: Date · Treatment record · Payment · Balance, with a running balance.
export function sheetRows(db, pid, extra) {
  const rows = [];
  db.visits.filter((v) => v.pid === pid && (!extra || v.id !== extra.skipVisit)).forEach((v) =>
    rows.push({ id: v.id, date: v.date, text: svcText(v) || 'Visit', charge: v.total, paid: sum(db.payments.filter((x) => x.visitId === v.id), (x) => x.amount) }));
  db.payments.filter((x) => x.pid === pid && !x.visitId).forEach((x) =>
    rows.push({ id: x.id, date: x.date, text: `Payment towards balance (${x.mode})`, charge: 0, paid: x.amount }));
  rows.sort((a, b) => a.date.localeCompare(b.date));
  if (extra) rows.push(extra);
  let run = 0;
  return rows.map((r) => ({ ...r, balance: (run += r.charge - r.paid) }));
}

// A checkout price that differs from the list price asks the doctor whether to make it the default.
export function priceApprovals(db, lines, pid, date) {
  const out = [];
  lines.forEach((l) => {
    const s = db.services.find((x) => x.name === l.name);
    const pending = (a) => a.svcId === s.id && a.status === 'pending';
    if (s && s.price !== l.price && !db.approvals.some(pending) && !out.some(pending))
      out.push({ svcId: s.id, name: s.name, old: s.price, price: l.price, pid, date, status: 'pending' });
  });
  return out;
}
