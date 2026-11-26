import { today, sum, mins, inr } from './format.js';
import { bal, owing } from './balance.js';
import { dueFU } from './followups.js';
import { invAlerts } from './inventory.js';

// Raw numbers behind the doctor's overview tiles.
export function kpiNumbers(db) {
  const t = today(), m = t.slice(0, 7), q = db.queue.filter((x) => x.date === t);
  const pay = (pre) => db.payments.filter((x) => x.date.startsWith(pre));
  const timed = db.visits.filter((v) => v.date === t && v.inTime && v.outTime);
  const ex = db.expenses.filter((e) => e.date.startsWith(m)), dues = owing(db);
  const collectedMonth = sum(pay(m), (x) => x.amount), spentMonth = sum(ex, (e) => e.amount);
  return {
    patientsToday: q.length, seen: q.filter((x) => x.status === 'done' || x.status === 'checkout').length, waiting: q.filter((x) => x.status === 'waiting').length,
    collectedToday: sum(pay(t), (x) => x.amount), paymentsToday: pay(t).length,
    collectedMonth, spentMonth, netMonth: collectedMonth - spentMonth, expensesMonth: ex.length,
    dues: sum(dues, (p) => bal(db, p.id)), owingPatients: dues.length,
    avgChair: timed.length ? Math.round(sum(timed, (v) => mins(v.outTime) - mins(v.inTime)) / timed.length) : 0, timedVisits: timed.length,
    activeOrtho: db.cases.filter((c) => c.status === 'open' && c.ortho).length,
    followUpsDue: dueFU(db).length,
    newPatients: db.patients.filter((p) => (p.created || '').startsWith(m) && !p.imported).length,
    stockAlerts: invAlerts(db).length,
  };
}

export function kpis(db) {
  const n = kpiNumbers(db), s = (k) => (k === 1 ? '' : 's');
  return [
    { k: 'today', l: 'Patients today', v: n.patientsToday, s: `${n.seen} seen · ${n.waiting} waiting` },
    { k: 'coltoday', l: 'Collected today', v: inr(n.collectedToday), s: `${n.paymentsToday} payment${s(n.paymentsToday)}` },
    { k: 'colmonth', l: 'Collected this month', v: inr(n.collectedMonth), s: `net ${inr(n.netMonth)} after expenses` },
    { k: 'dues', l: 'Pending dues', v: inr(n.dues), s: `${n.owingPatients} patients`, tone: 'pay' },
    { k: 'chair', l: 'Average chair time today', v: n.avgChair ? n.avgChair + ' min' : '–', s: `${n.timedVisits} visits timed` },
    { k: 'ortho', l: 'Active ortho cases', v: n.activeOrtho, s: 'braces and aligners' },
    { k: 'fu', l: 'Follow-ups due', v: n.followUpsDue, s: 'today or overdue, not booked' },
    { k: 'newp', l: 'New patients this month', v: n.newPatients, s: 'registered here' },
    { k: 'exp', l: 'Spent this month', v: inr(n.spentMonth), s: `${n.expensesMonth} expenses` },
    { k: 'stock', l: 'Stock alerts', v: n.stockAlerts, s: 'low, expiring or expired', tone: n.stockAlerts ? 'warn' : '' },
  ];
}
