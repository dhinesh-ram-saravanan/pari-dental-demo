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
// All balances in one pass (the per-patient functions above are too slow for a few thousand imported patients).
export function balances(db) {
  const m = {};
  db.visits.forEach((v) => { m[v.pid] = (m[v.pid] || 0) + (+v.total || 0); });
  db.payments.forEach((x) => { m[x.pid] = (m[x.pid] || 0) - x.amount; });
  return m;
}
export const owing = (db) => { const m = balances(db); return db.patients.filter((p) => m[p.id] > 0); };
export const totalDues = (db) => sum(Object.values(balances(db)), (b) => (b > 0 ? b : 0));

const svcText = (v) => v.services.map((s) => (s.teeth?.length ? s.teeth.join(', ') + ' ' : '') + s.name + (s.step ? ` (${s.step.toLowerCase()})` : '')).join(', ');

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
    if (l.step) return; // measurement and fitting lines split one price over two visits
    const s = db.services.find((x) => x.name === l.name);
    const pending = (a) => a.svcId === s.id && a.status === 'pending';
    if (s && s.price !== l.price && !db.approvals.some(pending) && !out.some(pending))
      out.push({ svcId: s.id, name: s.name, old: s.price, price: l.price, pid, date, status: 'pending' });
  });
  return out;
}
