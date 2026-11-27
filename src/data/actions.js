// Mutations. Each takes the (mutable) db and returns { ok, msg, ... } so the page can toast.
import { today, nowT, fmtD, addDays, sum, uid, inr } from '../logic/format.js';
import { bal, priceApprovals } from '../logic/balance.js';
import { markBooked } from '../logic/followups.js';
import { emptyP, allocReg } from '../logic/validation.js';
import { P, SV, svByName, tq, curQ } from './selectors.js';
import { DOCTOR } from './constants.js';

export function addToQueue(db, pid, source, apptId) {
  const t = today(), p = P(db, pid);
  if (tq(db).some((x) => x.pid === pid && x.status !== 'done')) return { ok: false, msg: `${p.name} is already in today’s queue` };
  const token = Math.max(0, ...tq(db).map((x) => x.token)) + 1;
  const ap = apptId ? db.appointments.find((a) => a.id === apptId) : db.appointments.find((a) => a.pid === pid && a.date === t && a.status === 'booked');
  if (ap) { ap.status = 'checked-in'; source = 'Appointment'; }
  db.queue.push({ id: 'q' + uid(), date: t, token, pid, time: nowT(), source, status: 'waiting' });
  return { ok: true, token, msg: `Token ${token}: ${p.name} added to the queue` };
}

export function bookAppt(db, pid, date, time, reason) {
  if (db.appointments.some((a) => a.date === date && a.time === time && a.status === 'booked')) return { ok: false, msg: `${time} on ${fmtD(date)} is already booked` };
  db.appointments.push({ id: 'a' + uid(), pid, date, time, reason, status: 'booked' });
  markBooked(db, pid);
  return { ok: true, msg: `Booked ${P(db, pid).name} at ${time} on ${fmtD(date)}` };
}

// Book (optionally for a brand-new patient) or move an existing booking.
export function submitBooking(db, f, reschedId) {
  if (reschedId) {
    const old = db.appointments.find((a) => a.id === reschedId);
    old.status = 'cancelled';
    const r = bookAppt(db, old.pid, f.date, f.time, f.reason);
    if (!r.ok) { old.status = 'booked'; return r; }
    return { ok: true, msg: `Moved to ${f.time} on ${fmtD(f.date)}` };
  }
  let pid = f.pid;
  if (pid === 'new') {
    if (db.appointments.some((a) => a.date === f.date && a.time === f.time && a.status === 'booked')) return { ok: false, msg: `${f.time} on ${fmtD(f.date)} is already booked` };
    let p = db.patients.find((x) => x.mobile === f.newPhone);
    if (!p) { p = { ...emptyP(), id: 'p' + uid(), reg: allocReg(db), created: today(), name: f.newName.trim(), mobile: f.newPhone, emerg: '', sig: false, verified: false, forOther: null }; delete p.consent; db.patients.push(p); }
    pid = p.id;
  }
  return bookAppt(db, pid, f.date, f.time, f.reason);
}

// Only reception sends patients in, one at a time.
export function sendIn(db, qid) {
  const cur = curQ(db);
  if (cur) return { ok: false, msg: `The doctor is still with ${P(db, cur.pid).name}. Wait for the hand-over.` };
  const q = db.queue.find((x) => x.id === qid);
  q.status = 'in'; q.inTime = nowT();
  return { ok: true, msg: `${P(db, q.pid).name} sent in to the doctor` };
}

// Doctor finishes the visit. d = { pid, caseId, recs:[{svcId,name,teeth,price,planItemId}], remarks, rx, nextIn, nextReason, close }
export function handOver(db, d) {
  const q = curQ(db), recs = d.recs.filter((r) => r.name.trim());
  if (!q) return { ok: false, msg: 'No patient is in the chair' };
  if (!recs.length) return { ok: false, msg: 'Choose at least one treatment done today' };
  for (const r of recs) {
    const bad = r.teeth.split(/[ ,]+/).filter(Boolean).find((n) => !/^[1-4][1-8]$/.test(n));
    if (bad) return { ok: false, msg: `“${bad}” is not a tooth number. Use 11–18, 21–28, 31–38, 41–48.` };
    if (r.price !== '' && !(+r.price >= 0)) return { ok: false, msg: `Check the price for ${r.name}` };
  }
  const p0 = P(db, d.pid);
  let c = db.cases.find((x) => x.id === d.caseId);
  if (!c) { const f = recs[0]; c = { id: 'c' + uid(), pid: p0.id, cat: SV(db, f.svcId)?.cat || p0.cat, title: f.name.replace(' package', '') + (f.teeth ? ' – ' + f.teeth : ''), status: 'open', opened: today(), sittings: 1, items: [], ortho: /package/.test(f.name) }; db.cases.push(c); }
  const ch = (db.charts[d.pid] = db.charts[d.pid] || {}), done = [];
  recs.forEach((r) => {
    let s = r.svcId && r.svcId !== 'other' ? SV(db, r.svcId) : svByName(db, r.name.trim());
    // a typed "Other" treatment is saved as a service for next time
    if (!s) { s = { id: 's' + uid(), cat: c.cat || p0.cat, name: r.name.trim(), price: +r.price || 0, marks: '', note: '', active: true, byDoctor: true }; db.services.push(s); }
    const teeth = r.teeth.split(/[ ,]+/).filter(Boolean), price = r.price === '' ? null : +r.price;
    let it = r.planItemId && c.items.find((x) => x.id === r.planItemId);
    if (!it) { it = { id: uid(), name: s.name, svcId: s.id, teeth, price: price ?? s.price, done: false }; c.items.push(it); }
    Object.assign(it, { name: s.name, svcId: s.id, teeth, done: true, doneDate: today() });
    if (price !== null) it.price = price;
    if (s.marks) teeth.forEach((n) => { ch[n] = s.marks; });
    done.push({ name: s.name, teeth, price });
  });
  if (d.close == null ? c.items.every((x) => x.done) : d.close) c.status = 'closed';
  db.visits.filter((y) => y.pid === d.pid && y.fu && y.fu !== 'done').forEach((y) => { y.fu = 'done'; });
  q.outTime = nowT();
  const vis = { id: 'v' + uid(), pid: d.pid, caseId: c.id, date: today(), services: done, notes: '', rx: d.rx || '', total: sum(done, (x) => x.price || 0), handled: DOCTOR, nextVisit: null, nextReason: d.nextIn ? d.nextReason : '', suggest: d.nextIn, fu: null, stage: 'checkout', inTime: q.inTime, outTime: q.outTime, remarks: d.remarks || q.remarks || '' };
  db.visits.push(vis);
  q.status = 'checkout'; q.visitId = vis.id;
  const ap = db.appointments.find((x) => x.pid === d.pid && x.date === today() && x.status === 'checked-in');
  if (ap) ap.status = 'visited';
  return { ok: true, msg: `${p0.name} handed over to reception` };
}

export function coInit(db, qid) {
  const x = db.queue.find((y) => y.id === qid), v = db.visits.find((y) => y.id === x.visitId);
  return { qid, lines: v.services.map((s) => ({ ...s })), paid: '', mode: 'UPI', handled: DOCTOR, nextMode: v.suggest ? 'book' : 'none', date: addDays(today(), +(v.suggest || 7)), time: '11:00', reason: v.nextReason || '' };
}

export function checkout(db, co) {
  const x = db.queue.find((y) => y.id === co.qid), v = db.visits.find((y) => y.id === x.visitId), p = P(db, x.pid), paid = +co.paid || 0;
  if (co.lines.some((l) => l.price === null)) return { ok: false, msg: 'Enter the price for every treatment' };
  if (co.lines.some((l) => !(l.price >= 0))) return { ok: false, msg: 'A price cannot be less than 0' };
  if (co.paid !== '' && !(paid >= 0)) return { ok: false, msg: 'The amount received cannot be less than 0' };
  if (co.paid === '') return { ok: false, msg: 'Enter the amount received (0 if nothing today)' };
  if (co.nextMode !== 'none' && (!co.date || co.date < today())) return { ok: false, msg: 'Choose today or a later date for the next visit' };
  if (co.nextMode === 'book') { const r = bookAppt(db, p.id, co.date, co.time, co.reason); if (!r.ok) return r; }
  priceApprovals(db, co.lines, p.id, today()).forEach((a) => db.approvals.push({ id: uid(), ...a }));
  Object.assign(v, { services: co.lines, total: sum(co.lines, (l) => l.price), handled: co.handled, stage: 'closed' });
  if (paid > 0) db.payments.push({ id: uid(), pid: p.id, visitId: v.id, date: today(), amount: paid, mode: co.mode });
  if (co.nextMode === 'none') Object.assign(v, { nextVisit: null, fu: null });
  else Object.assign(v, { nextVisit: co.date, nextReason: co.reason, fu: co.nextMode === 'book' ? 'booked' : 'pending' });
  x.status = 'done';
  return { ok: true, msg: `Saved · ${p.name} balance ${inr(bal(db, p.id))}` };
}

export function payDue(db, pid, amount, mode) {
  if (!(+amount > 0)) return { ok: false, msg: 'Enter an amount' };
  db.payments.push({ id: uid(), pid, visitId: null, date: today(), amount: +amount, mode });
  return { ok: true, msg: `${inr(+amount)} collected from ${P(db, pid).name}` };
}

export function decideApproval(db, id, approve) {
  const ap = db.approvals.find((x) => x.id === id);
  ap.status = approve ? 'approved' : 'kept';
  if (approve) SV(db, ap.svcId).price = ap.price;
  return { ok: true, msg: approve ? `${ap.name} is now ${inr(ap.price)}` : `${ap.name} stays at ${inr(ap.old)}` };
}
