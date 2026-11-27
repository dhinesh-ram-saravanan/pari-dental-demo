// Read-only views over the database. Every function takes the db first.
import { today, addDays, nowT, fmtD, fill, sum, mins, inr } from '../logic/format.js';
import { ageOf } from '../logic/age.js';
import { bal, balOn, owing, totalDues } from '../logic/balance.js';
import { dueFU } from '../logic/followups.js';
import { invAlerts, invStatus } from '../logic/inventory.js';
import { labToCall, labOverdue, labText } from '../logic/lab.js';
import { DOCTOR } from './constants.js';

export const P = (db, id) => db.patients.find((p) => p.id === id);
export const SV = (db, id) => db.services.find((s) => s.id === id);
export const svByName = (db, n) => db.services.find((s) => s.name === n);
export const tq = (db) => db.queue.filter((x) => x.date === today());
export const curQ = (db) => tq(db).find((x) => x.status === 'in');
export const alertsOf = (p) => [...(p.med || []), ...(p.allergy ? ['Allergy: ' + p.allergy] : []), ...(p.preg ? ['Pregnant'] : []), ...(p.nurse ? ['Nursing'] : []), ...(p.other ? [p.other] : [])];
export const openCases = (db, pid) => db.cases.filter((c) => c.pid === pid && c.status === 'open');
export const caseLine = (c) => `${c.title} · ${c.ortho ? 'month ' + Math.max(1, c.items.filter((x) => x.done && x.name === 'Monthly adjustment').length + 1) : `${c.items.filter((x) => x.done).length} of ${c.items.length} done`}`;
export const pendingAppr = (db) => db.approvals.filter((a) => a.status === 'pending');
export const treaters = (db) => db.staff.filter((s) => s.active && (s.role === 'Doctor' || s.role === 'Junior doctor'));
export const itemText = (x) => x.name + (x.teeth?.length ? ' ' + x.teeth.join(',') : '') + (x.step ? ` (${x.step.toLowerCase()})` : '');
export const waLink = (p, msg) => `https://wa.me/91${(p.mobile || '').replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(msg)}`;
// Contact actions for a ⋯ menu; none when the patient has no mobile on file (old imported records).
export const contactItems = (p, msg, again = '') => (p.mobile
  ? [{ label: 'WhatsApp' + again, href: waLink(p, msg) }, { label: 'Call' + again, href: 'tel:+91' + p.mobile }]
  : p.office ? [{ label: `Call office phone ${p.office}`, href: 'tel:' + p.office }] : []);
export const SLOT_TAKEN = (db, date) => new Map(db.appointments.filter((a) => a.date === date && a.status === 'booked').map((a) => [a.time, P(db, a.pid)?.name || 'Booked']));
// Search by name, Reg. No. or mobile (spaces, +91 and a leading 0 are ignored).
export function findPatients(db, text) {
  const s = text.trim().toLowerCase(), dg = s.replace(/\D/g, '').replace(/^(91|0)(?=\d{6,})/, '');
  if (s.length < 2) return [];
  return db.patients.filter((p) => p.name.toLowerCase().includes(s) || (dg.length >= 2 && ((p.mobile || '').includes(dg) || String(p.reg).includes(dg))));
}
export const remind = (db, p, date, reason, time) => fill(db.clinic.template, { name: p.name, clinic: db.clinic.name, reason: reason || 'check-up', date: fmtD(date) + (time ? ' at ' + time : ''), phone: db.clinic.phone });
export const dueMsg = (db, p) => `Hello ${p.name}, a balance of ${inr(bal(db, p.id))} is pending at ${db.clinic.name}. You can pay at your next visit. Thank you.`;

// What the patient is here for: the booking reason, else the next planned item, else the complaint.
export const procOf = (db, pid, reason) => {
  if (reason) return reason;
  const c = openCases(db, pid)[0], n = c && c.items.find((x) => !x.done);
  return n ? itemText(n) : P(db, pid).complaint || 'Consultation';
};

// Today's single list: everyone in the queue plus bookings not yet arrived.
export function todayRows(db) {
  const t = today(), rows = [];
  tq(db).forEach((x) => { const ap = db.appointments.find((a) => a.pid === x.pid && a.date === t && a.status !== 'booked' && a.status !== 'cancelled'); rows.push({ k: 'q', id: x.id, pid: x.pid, time: x.time, token: x.token, st: x.status, src: x.source, inTime: x.inTime, reason: procOf(db, x.pid, ap?.reason) }); });
  db.appointments.filter((a) => a.date === t && a.status === 'booked').forEach((a) => rows.push({ k: 'a', id: a.id, pid: a.pid, time: a.time, st: 'notyet', src: 'Appointment', reason: procOf(db, a.pid, a.reason) }));
  const o = { in: 0, checkout: 1, waiting: 2, notyet: 3, done: 4 };
  return rows.sort((a, b) => o[a.st] - o[b.st] || a.time.localeCompare(b.time));
}
export const nextWaiting = (db) => todayRows(db).filter((r) => r.st === 'waiting').sort((a, b) => a.token - b.token)[0];

// One register row per visit (or planned visit) on a day.
export function registerRows(db, D) {
  const rows = [], seen = new Set();
  const mk = (pid, q, v, a) => {
    const p = P(db, pid), ap = a || db.appointments.find((x) => x.pid === pid && x.date === D && x.status !== 'cancelled');
    const inT = q?.inTime || v?.inTime || '', outT = q?.outTime || v?.outTime || '', done = v && v.services.length;
    const st = q ? q.status : v ? 'done' : 'notyet';
    return { key: D + (v?.id || q?.id || ap?.id || pid), date: D, pid, reg: p.reg, name: p.name, age: ageOf(p), sex: p.sex || '', cat: p.cat, mobile: p.mobile || '',
      proc: done ? v.services.map(itemText).join(', ') : ap?.reason || procOf(db, pid), planned: !done, appt: ap ? ap.time : '', walkin: !ap, inT, outT, dur: inT && outT ? mins(outT) - mins(inT) : null,
      remarks: v?.remarks || q?.remarks || '', remRef: v ? 'v:' + v.id : q ? 'q:' + q.id : '', pay: sum(db.payments.filter((x) => x.pid === pid && x.date === D), (x) => x.amount), bal: balOn(db, pid, D), owes: bal(db, pid), doc: v?.handled || (st === 'in' ? DOCTOR : ''), st };
  };
  db.queue.filter((q) => q.date === D).forEach((q) => {
    // older seeded entries have no visitId: fall back to that day's visit, but only once and only for a finished entry
    const v = q.visitId ? db.visits.find((x) => x.id === q.visitId) : q.status === 'done' || q.status === 'checkout' ? db.visits.find((x) => x.pid === q.pid && x.date === D && !seen.has(x.id)) : undefined;
    if (v) seen.add(v.id); rows.push(mk(q.pid, q, v));
  });
  db.visits.filter((v) => v.date === D && !seen.has(v.id)).forEach((v) => rows.push(mk(v.pid, null, v)));
  db.appointments.filter((a) => a.date === D && a.status === 'booked' && !rows.some((r) => r.pid === a.pid)).forEach((a) => rows.push(mk(a.pid, null, null, a)));
  // a patient seen twice in a day: the day's payment is shown once, and keys stay unique
  const paid = new Set();
  rows.forEach((r, i) => { if (paid.has(r.pid)) r.pay = 0; paid.add(r.pid); r.key += ':' + i; });
  return rows;
}
export function registerRange(db, from, to) {
  const [a, b] = from <= to ? [from, to] : [to, from], out = [];
  for (let d = a, i = 0; d <= b && i < 370; i++, d = addDays(d, 1)) out.push(...registerRows(db, d));
  return out;
}

export const noteVisible = (db, k) => !db.notes.dismissed[k] && !(db.notes.snooze[k] && db.notes.snooze[k] > today());
const s = (n) => (n === 1 ? '' : 's');
const stockText = (inv) => `Stock: ${inv.map((i) => `${i.name} (${invStatus(i)[1].toLowerCase()})`).join(', ')}`;

// Notices carry one action as { label, do, arg } (or { label, href }); the page wires `do` to a handler.
export function frontNotices(db) {
  const t = today(), N = [];
  const unv = db.patients.filter((p) => !p.verified);
  if (unv.length) N.push({ k: 'forms:' + unv.map((p) => p.id).join(','), tone: 'warn', text: `${unv.length} new patient form${s(unv.length)} to check: ${unv.map((p) => p.name).join(', ')}`, act: { label: 'Check', do: 'review', arg: unv[0].id } });
  const late = db.appointments.filter((a) => a.date === t && a.status === 'booked' && a.time < nowT());
  if (late.length) N.push({ k: `late:${t}:${late.length}`, tone: 'warn', text: `${late.length} booked patient${s(late.length)} late today: ${late.map((a) => `${P(db, a.pid).name} (${a.time})`).join(', ')}`, act: { label: 'Remind on WhatsApp', href: waLink(P(db, late[0].pid), remind(db, P(db, late[0].pid), t, late[0].reason, late[0].time)) } });
  const co = tq(db).filter((x) => x.status === 'checkout');
  if (co.length) N.push({ k: 'co:' + co.map((x) => x.id).join(','), tone: 'pay', text: `${co.length} patient${s(co.length)} waiting to pay: ${co.map((x) => P(db, x.pid).name).join(', ')}`, act: { label: 'Checkout', do: 'checkout', arg: co[0].id } });
  const dues = owing(db);
  if (dues.length) N.push({ k: 'dues:' + t, tone: 'pay', text: `Pending dues of ${inr(totalDues(db))} from ${dues.length} patients`, act: { label: 'View', do: 'dues' } });
  const fu = dueFU(db).filter((v) => v.fu !== 'contacted');
  if (fu.length) N.push({ k: 'fu:' + t, tone: 'info', text: `${fu.length} follow-up${s(fu.length)} to call today or overdue`, act: { label: 'Open calendar', do: 'go', arg: '/calendar' } });
  const tm = db.appointments.filter((a) => a.date === addDays(t, 1) && a.status === 'booked');
  if (tm.length) N.push({ k: 'tmr:' + t, tone: 'info', text: `${tm.length} booked for tomorrow. Send WhatsApp reminders.`, act: { label: 'See bookings', do: 'tomorrow' } });
  const ready = labToCall(db);
  if (ready.length) N.push({ k: 'labin:' + ready.map((o) => o.id).join(','), tone: 'pay', text: `Lab work arrived, call for fitting: ${ready.map((o) => `${P(db, o.pid).name} (${labText(o)})`).join(', ')}`, act: { label: 'Lab work', do: 'go', arg: '/lab' } });
  const overdue = labOverdue(db);
  if (overdue.length) N.push({ k: 'lablate:' + overdue.map((o) => o.id).join(','), tone: 'warn', text: `Lab work overdue from the supplier: ${overdue.map((o) => `${labText(o)} for ${P(db, o.pid).name}`).join(', ')}`, act: { label: 'Lab work', do: 'go', arg: '/lab' } });
  const inv = invAlerts(db);
  if (inv.length) N.push({ k: 'inv:' + inv.map((i) => i.id + invStatus(i)[1]).join(','), tone: 'warn', text: stockText(inv), act: { label: 'Inventory', do: 'go', arg: '/inventory' } });
  const ap = pendingAppr(db);
  if (ap.length) N.push({ k: 'appr:' + ap.map((a) => a.id).join(','), tone: 'info', text: `${ap.length} price change${s(ap.length)} waiting for the doctor’s approval`, act: null });
  return N;
}

export function doctorNotices(db) {
  const N = [];
  pendingAppr(db).forEach((a) => N.push({ k: 'appr:' + a.id, tone: 'warn', text: `Reception charged ${inr(a.price)} for ${a.name} (${P(db, a.pid)?.name || 'patient'}, ${fmtD(a.date)}; list ${inr(a.old)}). Make it the default?`, act: { label: 'Approve', do: 'approve', arg: a.id }, act2: { label: 'Keep ' + inr(a.old), do: 'keep', arg: a.id }, nodismiss: true }));
  const inv = invAlerts(db);
  if (inv.length) N.push({ k: 'dinv:' + inv.map((i) => i.id + invStatus(i)[1]).join(','), tone: 'warn', text: stockText(inv), act: { label: 'Inventory', do: 'go', arg: '/inventory' } });
  const od = db.cases.filter((c) => c.status === 'open' && c.ortho).filter((c) => { const last = db.visits.filter((v) => v.caseId === c.id).map((v) => v.date).sort().pop(); return last && last < addDays(today(), -40); });
  if (od.length) N.push({ k: 'orth:' + today(), tone: 'info', text: `${od.length} ortho patient${s(od.length)} not seen for over 40 days: ${od.map((c) => P(db, c.pid).name).join(', ')}`, act: null });
  const dues = owing(db);
  if (dues.length) N.push({ k: 'ddues:' + today(), tone: 'pay', text: `${inr(totalDues(db))} pending from ${dues.length} patients`, act: { label: 'See who', do: 'kpi', arg: 'dues' } });
  return N;
}

export const navCounts = (db) => ({
  '/front-desk': tq(db).filter((x) => x.status === 'checkout').length + db.patients.filter((p) => !p.verified).length,
  '/calendar': dueFU(db).filter((v) => v.fu !== 'contacted').length,
  '/doctor': tq(db).filter((x) => x.status === 'waiting').length,
  '/clinic': pendingAppr(db).length,
  '/inventory': invAlerts(db).length,
  '/lab': labToCall(db).length + labOverdue(db).length,
});
