// Mutations. Each takes the (mutable) db and returns { ok, msg, ... } so the page can toast.
import { today, nowT, fmtD, addDays, sum, uid, inr } from '../logic/format.js';
import { bal, priceApprovals } from '../logic/balance.js';
import { markBooked } from '../logic/followups.js';
import { createLabOrder } from '../logic/lab.js';
import { emptyP, allocReg, validateBooking } from '../logic/validation.js';
import { P, SV, svByName, tq, curQ, SLOT_TAKEN } from './selectors.js';
import { DOCTOR, SLOTS } from './constants.js';

const GONE = { ok: false, msg: 'That was changed on another screen. Please check and try again.' };
// First slot nobody has on that day (and, for today, that has not passed).
export const firstFree = (db, date) => { const taken = SLOT_TAKEN(db, date); return SLOTS.find((s) => !taken.has(s) && (date !== today() || s > nowT())) || SLOTS[0]; };

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
  const same = db.appointments.find((a) => a.pid === pid && a.date === date && a.status === 'booked');
  if (same) return { ok: false, msg: `${P(db, pid).name} is already booked at ${same.time} that day. Reschedule that booking instead.` };
  const id = 'a' + uid();
  db.appointments.push({ id, pid, date, time, reason, status: 'booked' });
  markBooked(db, pid);
  return { ok: true, id, msg: `Booked ${P(db, pid).name} at ${time} on ${fmtD(date)}` };
}

// Book (optionally for a brand-new patient) or move an existing booking.
export function submitBooking(db, f, reschedId) {
  if (reschedId) {
    const old = db.appointments.find((a) => a.id === reschedId);
    if (!old || old.status !== 'booked') return GONE;
    old.status = 'cancelled';
    const r = bookAppt(db, old.pid, f.date, f.time, f.reason);
    if (!r.ok) { old.status = 'booked'; return r; }
    return { ok: true, msg: `Moved to ${f.time} on ${fmtD(f.date)}` };
  }
  let pid = f.pid;
  if (pid === 'new') {
    if (db.appointments.some((a) => a.date === f.date && a.time === f.time && a.status === 'booked')) return { ok: false, msg: `${f.time} on ${fmtD(f.date)} is already booked` };
    // families share a mobile: only the same name on the same number is the same person
    let p = db.patients.find((x) => x.mobile === f.newPhone && x.name.toLowerCase() === f.newName.trim().toLowerCase());
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
  if (!q || q.status !== 'waiting') return GONE;
  q.status = 'in'; q.inTime = nowT();
  return { ok: true, msg: `${P(db, q.pid).name} sent in to the doctor` };
}

// Doctor finishes the visit. d = { pid, caseId, recs:[{svcId,name,teeth,price,planItemId,when}], remarks, rx, nextIn, nextReason, close }
// when: 'done' (default) · 'later' (planned, not done today) · 'measure' (lab work: measurement taken) · 'fit' (lab work fitted)
export function handOver(db, d) {
  const q = curQ(db), recs = d.recs.filter((r) => r.name.trim());
  if (!q) return { ok: false, msg: 'No patient is in the chair' };
  if (!recs.some((r) => r.when !== 'later')) return { ok: false, msg: 'Choose at least one treatment done today' };
  for (const r of recs) {
    const bad = r.teeth.split(/[ ,]+/).filter(Boolean).find((n) => !/^([1-4][1-8]|[5-8][1-5])$/.test(n)); // adult and milk teeth
    if (bad) return { ok: false, msg: `“${bad}” is not a tooth number. Use 11–48, or 51–85 for milk teeth.` };
    if (r.price !== '' && !(+r.price >= 0)) return { ok: false, msg: `Check the price for ${r.name}` };
  }
  const p0 = P(db, d.pid);
  let c = db.cases.find((x) => x.id === d.caseId);
  // everything needed to take the visit back if the doctor handed over by mistake
  const undo = { items: [], created: [], lab: [], fitted: [], newCase: !c, caseStatus: c?.status };
  if (!c) { const f = recs[0]; c = { id: 'c' + uid(), pid: p0.id, cat: SV(db, f.svcId)?.cat || p0.cat, title: f.name.replace(' package', '') + (f.teeth ? ' – ' + f.teeth : ''), status: 'open', opened: today(), sittings: 1, items: [], ortho: /package/.test(f.name) }; db.cases.push(c); }
  const ch = (db.charts[d.pid] = db.charts[d.pid] || {}), done = [];
  recs.forEach((r) => {
    let s = r.svcId && r.svcId !== 'other' ? SV(db, r.svcId) : svByName(db, r.name.trim());
    // a typed "Other" treatment is saved as a service for next time
    if (!s) { s = { id: 's' + uid(), cat: c.cat || p0.cat, name: r.name.trim(), price: +r.price || 0, marks: '', note: '', active: true, byDoctor: true }; db.services.push(s); }
    const teeth = r.teeth.split(/[ ,]+/).filter(Boolean), price = r.price === '' ? null : +r.price;
    // a planned item picked from the dropdown (not the "Still planned" link) still ticks the plan
    let it = (r.planItemId && c.items.find((x) => x.id === r.planItemId)) || c.items.find((x) => !x.done && x.name === s.name && (!teeth.length || !x.teeth.length || x.teeth.join() === teeth.join()));
    if (!it) { it = { id: uid(), name: s.name, svcId: s.id, teeth, price: price ?? s.price, done: false }; c.items.push(it); undo.created.push(it.id); }
    Object.assign(it, { name: s.name, svcId: s.id, teeth });
    if (price !== null && r.when !== 'fit') it.price = price;
    if (r.when === 'later') return; // stays on the plan for another day
    if (r.when === 'measure') { // the supplier makes it; fitting is a later visit
      undo.lab.push(createLabOrder(db, { pid: d.pid, svc: s, teeth, caseId: c.id, itemId: it.id }).id);
      done.push({ name: s.name, teeth, price, step: 'Measurement taken' });
      return;
    }
    if (!it.done) undo.items.push(it.id);
    Object.assign(it, { done: true, doneDate: today() });
    if (s.marks) teeth.forEach((n) => { ch[n] = s.marks; });
    if (r.when === 'fit') {
      const o = db.labOrders.filter((x) => x.pid === d.pid && x.svcId === s.id && (x.status === 'arrived' || x.status === 'waiting')).sort((a, b) => (a.status === 'arrived' ? -1 : 1) - (b.status === 'arrived' ? -1 : 1))[0];
      if (o) { undo.fitted.push([o.id, o.status]); Object.assign(o, { status: 'fitted', fittedOn: today() }); }
      done.push({ name: s.name, teeth, price, step: 'Fitted' });
      return;
    }
    done.push({ name: s.name, teeth, price });
  });
  if (d.close == null ? c.items.every((x) => x.done) : d.close) c.status = 'closed';
  db.visits.filter((y) => y.pid === d.pid && y.fu && y.fu !== 'done').forEach((y) => { y.fu = 'done'; });
  q.outTime = nowT();
  const vis = { id: 'v' + uid(), pid: d.pid, caseId: c.id, date: today(), services: done, notes: d.notes || '', rx: d.rx || '', total: sum(done, (x) => x.price || 0), handled: DOCTOR, nextVisit: null, nextReason: d.nextIn ? d.nextReason : '', suggest: d.nextIn, fu: null, stage: 'checkout', inTime: q.inTime, outTime: q.outTime, remarks: d.remarks || q.remarks || '', undo };
  db.visits.push(vis);
  q.status = 'checkout'; q.visitId = vis.id;
  const ap = db.appointments.find((x) => x.pid === d.pid && x.date === today() && x.status === 'checked-in');
  if (ap) ap.status = 'visited';
  return { ok: true, msg: `${p0.name} handed over to reception` };
}

export function coInit(db, qid) {
  const x = db.queue.find((y) => y.id === qid), v = db.visits.find((y) => y.id === x.visitId);
  const date = addDays(today(), +(v.suggest || 7));
  return { qid, lines: v.services.map((s) => ({ ...s })), paid: '', mode: db.clinic.lastMode || 'UPI', handled: DOCTOR, nextMode: v.suggest ? 'book' : 'none', date, time: firstFree(db, date), reason: v.nextReason || '' };
}

export function checkout(db, co) {
  const x = db.queue.find((y) => y.id === co.qid), v = x && db.visits.find((y) => y.id === x.visitId);
  if (!v || x.status !== 'checkout') return GONE;
  const p = P(db, x.pid), paid = +co.paid || 0;
  if (!Number.isInteger(paid) || co.lines.some((l) => l.price !== null && !Number.isInteger(l.price))) return { ok: false, msg: 'Use whole rupees, without paise' };
  if (co.lines.some((l) => l.price === null)) return { ok: false, msg: 'Enter the price for every treatment' };
  if (co.lines.some((l) => !(l.price >= 0))) return { ok: false, msg: 'A price cannot be less than 0' };
  if (co.paid !== '' && !(paid >= 0)) return { ok: false, msg: 'The amount received cannot be less than 0' };
  if (co.paid === '') return { ok: false, msg: 'Enter the amount received (0 if nothing today)' };
  if (co.nextMode !== 'none' && (!co.date || co.date < today())) return { ok: false, msg: 'Choose today or a later date for the next visit' };
  if (co.nextMode === 'book' && validateBooking({ date: co.date, time: co.time }).d) return { ok: false, msg: 'That time has already passed. Choose a later slot.' };
  if (co.nextMode === 'book') { const r = bookAppt(db, p.id, co.date, co.time, co.reason); if (!r.ok) return r; v.bookedAppt = r.id; }
  priceApprovals(db, co.lines, p.id, today()).forEach((a) => db.approvals.push({ id: uid(), ...a }));
  Object.assign(v, { services: co.lines, total: sum(co.lines, (l) => l.price), handled: co.handled, stage: 'closed' });
  if (paid > 0) db.payments.push({ id: uid(), pid: p.id, visitId: v.id, date: today(), amount: paid, mode: co.mode });
  if (co.nextMode === 'none') Object.assign(v, { nextVisit: null, fu: null });
  else Object.assign(v, { nextVisit: co.date, nextReason: co.reason, fu: co.nextMode === 'book' ? 'booked' : 'pending' });
  x.status = 'done';
  db.clinic.lastMode = co.mode;
  return { ok: true, msg: `Saved · ${p.name} balance ${inr(bal(db, p.id))}` };
}

export function payDue(db, pid, amount, mode) {
  if (!(+amount > 0) || !Number.isInteger(+amount)) return { ok: false, msg: 'Enter an amount in whole rupees' };
  if (+amount > bal(db, pid)) return { ok: false, msg: `That is more than the balance of ${inr(bal(db, pid))}` };
  db.payments.push({ id: uid(), pid, visitId: null, date: today(), amount: +amount, mode });
  return { ok: true, msg: `${inr(+amount)} collected from ${P(db, pid).name}` };
}

// The doctor handed over by mistake: the visit comes back to the chair, as long as reception has not finished it.
export function takeBack(db, qid) {
  const q = db.queue.find((x) => x.id === qid), v = q && db.visits.find((y) => y.id === q.visitId);
  if (!v || q.status !== 'checkout') return GONE;
  if (curQ(db)) return { ok: false, msg: `${P(db, curQ(db).pid).name} is in the chair now. Finish that visit first.` };
  const c = db.cases.find((x) => x.id === v.caseId), u = v.undo || { items: [], created: [], lab: [], fitted: [] };
  if (c) {
    c.items.forEach((x) => { if (u.items.includes(x.id)) { x.done = false; delete x.doneDate; } });
    if (u.newCase) db.cases = db.cases.filter((x) => x.id !== c.id); else c.status = u.caseStatus || 'open';
  }
  db.labOrders = db.labOrders.filter((o) => !u.lab.includes(o.id));
  u.fitted.forEach(([id, st]) => { const o = db.labOrders.find((x) => x.id === id); if (o) Object.assign(o, { status: st, fittedOn: '' }); });
  db.visits = db.visits.filter((y) => y.id !== v.id);
  Object.assign(q, { status: 'in' }); delete q.visitId; delete q.outTime;
  const ap = db.appointments.find((x) => x.pid === q.pid && x.date === today() && x.status === 'visited');
  if (ap) ap.status = 'checked-in';
  // the doctor's form is filled in again with what was recorded
  const draft = { qid, pid: q.pid, teeth: [], caseId: u.newCase ? 'new' : v.caseId, rx: v.rx || '', remarks: v.remarks || '', notes: v.notes || '', notesTouched: true, nextIn: v.suggest || '', nextReason: v.nextReason || '', reasonTouched: !!v.nextReason, close: null,
    recs: v.services.map((s) => ({ key: uid(), svcId: svByName(db, s.name)?.id || 'other', name: s.name, teeth: (s.teeth || []).join(', '), price: s.price == null ? '' : String(s.price), planItemId: null, when: s.step === 'Fitted' ? 'fit' : s.step ? 'measure' : 'done' })) };
  return { ok: true, draft, msg: `${P(db, q.pid).name} is back in your chair` };
}

// Reception saved a checkout with a mistake: open it again. The payment and the booking made at that checkout are undone.
export function reopenCheckout(db, qid) {
  const q = db.queue.find((x) => x.id === qid), v = q && db.visits.find((y) => y.id === q.visitId);
  if (!v || q.status !== 'done' || q.date !== today()) return GONE;
  db.payments = db.payments.filter((x) => x.visitId !== v.id);
  const ap = v.bookedAppt && db.appointments.find((a) => a.id === v.bookedAppt);
  if (ap?.status === 'booked') ap.status = 'cancelled';
  Object.assign(v, { stage: 'checkout', nextVisit: null, fu: null }); delete v.bookedAppt;
  q.status = 'checkout';
  return { ok: true, msg: `Checkout reopened for ${P(db, q.pid).name}. Enter the payment again.` };
}

// A payment towards the balance that was entered wrongly.
export function deletePayment(db, id) {
  const x = db.payments.find((y) => y.id === id);
  if (!x || x.visitId) return GONE;
  db.payments = db.payments.filter((y) => y.id !== id);
  return { ok: true, msg: `Payment of ${inr(x.amount)} removed` };
}

// A waiting patient who left, or was added by mistake.
export function removeFromQueue(db, qid) {
  const q = db.queue.find((x) => x.id === qid);
  if (!q || q.status !== 'waiting') return GONE;
  db.queue = db.queue.filter((x) => x.id !== qid);
  const ap = db.appointments.find((a) => a.pid === q.pid && a.date === q.date && a.status === 'checked-in');
  if (ap) ap.status = 'booked';
  return { ok: true, msg: `${P(db, q.pid).name} removed from today’s queue` };
}
// Sent in by mistake: back to the waiting list.
export function backToWaiting(db, qid) {
  const q = db.queue.find((x) => x.id === qid);
  if (!q || q.status !== 'in') return GONE;
  q.status = 'waiting'; delete q.inTime;
  return { ok: true, msg: `${P(db, q.pid).name} moved back to waiting` };
}
export function cancelBooking(db, id) {
  const a = db.appointments.find((x) => x.id === id);
  if (!a || a.status !== 'booked') return GONE;
  a.status = 'cancelled';
  return { ok: true, msg: `Booking cancelled · ${P(db, a.pid).name}, ${a.time} on ${fmtD(a.date)}` };
}

export function decideApproval(db, id, approve) {
  const ap = db.approvals.find((x) => x.id === id);
  if (!ap || ap.status !== 'pending') return GONE;
  ap.status = approve ? 'approved' : 'kept';
  if (approve) SV(db, ap.svcId).price = ap.price;
  return { ok: true, msg: approve ? `${ap.name} is now ${inr(ap.price)}` : `${ap.name} stays at ${inr(ap.old)}` };
}
