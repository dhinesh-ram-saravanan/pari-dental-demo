import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { seed } from '../src/data/seed.js';
import { today, addDays } from '../src/logic/format.js';
import { ageOf } from '../src/logic/age.js';
import { bal, balBefore, balOn, sheetRows, priceApprovals } from '../src/logic/balance.js';
import { validateReg, emptyP, digits, mobileDigits, dobFromParts, savePatient, allocReg, mobileClash, validateBooking, validateStockIn } from '../src/logic/validation.js';
import { xlDate, parseSheet, importCounts, applyImport, exportRows } from '../src/logic/importParse.js';
import { callLists, markCalled, moveBack, closeFU, dueFU } from '../src/logic/followups.js';
import { invStatus, invQty, useStock as takeStock, stockIn } from '../src/logic/inventory.js';
import { kpiNumbers, kpis } from '../src/logic/kpi.js';
import { addToQueue, bookAppt, submitBooking, sendIn, handOver, coInit, checkout, payDue, decideApproval, cancelBooking, removeFromQueue, backToWaiting, firstFree } from '../src/data/actions.js';
import { curQ, tq, nextWaiting, registerRows, findPatients, frontNotices } from '../src/data/selectors.js';
import { labFor, labToCall, labOverdue, markArrived, setLabDetails, cancelLab } from '../src/logic/lab.js';
import { packForm, unpackForm } from '../src/logic/handoff.js';
import { takeBack, reopenCheckout, deletePayment } from '../src/data/actions.js';
import { MED } from '../src/data/constants.js';
import { stockInErrors } from '../src/logic/validation.js';

let db;
beforeEach(() => { db = seed(); });
const t = today();
const valid = () => ({ ...emptyP(), name: 'Anbu Selvan', sex: 'M', age: '34', address: '12, Main Road, Selaiyur', mobile: '9876543210', complaint: 'Tooth pain', consent: true, sig: true });

describe('seed', () => {
  it('is deterministic and shaped like the clinic', () => {
    expect(JSON.stringify(seed())).toBe(JSON.stringify(seed()));
    expect(db.patients.length).toBeGreaterThanOrEqual(38);
    expect(db.patients[0].reg).toBe(6001);
    expect(db.cases.filter((c) => c.ortho).length).toBe(7);
    expect(db.staff[0].name).toBe('Dr. Narasimman');
    expect(db.approvals.filter((a) => a.status === 'pending').length).toBe(1);
    expect(db.reports.length).toBe(1);
    expect(tq(db).map((q) => q.status).sort()).toEqual(['checkout', 'checkout', 'done', 'in', 'waiting', 'waiting', 'waiting']);
  });
});

describe('balance and part payments', () => {
  const mk = () => ({ visits: [{ id: 'v1', pid: 'a', date: '2026-01-01', total: 5000, services: [{ name: 'RCT', teeth: ['36'] }] }, { id: 'v2', pid: 'a', date: '2026-01-10', total: 4000, services: [{ name: 'Crown', teeth: [] }] }],
    payments: [{ id: 'x1', pid: 'a', visitId: 'v1', date: '2026-01-01', amount: 2000, mode: 'Cash' }, { id: 'x2', pid: 'a', visitId: null, date: '2026-01-05', amount: 1000, mode: 'UPI' }] });
  it('carries the unpaid part forward', () => {
    const d = mk();
    expect(bal(d, 'a')).toBe(6000);
    expect(balBefore(d, 'a', 'v2')).toBe(2000);
    expect(balOn(d, 'a', '2026-01-01')).toBe(3000);
    expect(balOn(d, 'a', '2026-01-05')).toBe(2000);
    expect(bal(d, 'nobody')).toBe(0);
  });
  it('builds the record sheet with a running balance', () => {
    const rows = sheetRows(mk(), 'a');
    expect(rows.map((r) => r.balance)).toEqual([3000, 2000, 6000]);
    expect(rows[0].text).toBe('36 RCT');
    expect(rows[1].text).toMatch(/Payment towards balance \(UPI\)/);
  });
  it('collecting a due reduces the balance and rejects zero', () => {
    const owes = db.patients.find((p) => bal(db, p.id) > 0), before = bal(db, owes.id);
    expect(payDue(db, owes.id, 0, 'Cash').ok).toBe(false);
    expect(payDue(db, owes.id, 500, 'Cash').ok).toBe(true);
    expect(bal(db, owes.id)).toBe(before - 500);
  });
});

describe('age from DOB', () => {
  const now = new Date('2026-11-27T12:00:00');
  it('counts whole years, birthday-aware', () => {
    expect(ageOf({ dob: '2000-11-27' }, now)).toBe(26);
    expect(ageOf({ dob: '2000-11-28' }, now)).toBe(25);
    expect(ageOf({ dob: '2026-01-01' }, now)).toBe(0);
  });
  it('falls back to the typed age', () => {
    expect(ageOf({ dob: '', age: 40 })).toBe(40);
    expect(ageOf({ dob: '' })).toBe('');
  });
});

describe('registration validation', () => {
  const err = (patch) => validateReg({ ...valid(), ...patch });
  it('accepts a complete form', () => expect(err({})).toEqual({}));
  it('requires name, sex, age or DOB, address, mobile, complaint, consent and signature', () => {
    expect(Object.keys(validateReg(emptyP())).sort()).toEqual(['address', 'age', 'complaint', 'consent', 'mobile', 'name', 'sex', 'sig']);
  });
  it('name: letters, spaces and dots only', () => {
    expect(err({ name: 'R2D2' }).name).toBeTruthy();
    expect(err({ name: 'S. Manoharan' }).name).toBeUndefined();
  });
  it('mobile: exactly 10 digits starting 6–9', () => {
    for (const m of ['12345', '5876543210', '98765432101', '98765abcde']) expect(err({ mobile: m }).mobile).toBeTruthy();
    for (const m of ['6000000000', '9876543210']) expect(err({ mobile: m }).mobile).toBeUndefined();
  });
  it('strips non-digits as you type', () => {
    expect(digits('+91 98765-43210')).toBe('9198765432');
    expect(digits('98a76 5', 10)).toBe('98765');
    expect(digits('04422223333', 11)).toBe('04422223333');
  });
  it('mobile field drops +91 or a leading 0 and keeps 10 digits', () => {
    expect(mobileDigits('+91 98765 43210')).toBe('9876543210');
    expect(mobileDigits('09876543210')).toBe('9876543210');
    expect(mobileDigits('98765-43210 99')).toBe('9876543210');
    expect(mobileDigits('91234')).toBe('91234');
  });
  it('date of birth from day, month and year', () => {
    expect(dobFromParts('', '', '')).toEqual({ dob: '', error: '' });
    expect(dobFromParts('5', '3', '1990')).toEqual({ dob: '1990-03-05', error: '' });
    expect(dobFromParts('5', '', '1990').error).toBeTruthy();
    expect(dobFromParts('31', '2', '2000').error).toBe('That date does not exist');
    expect(err({ dobD: '31', dobM: '2', dobY: '2000' }).dob).toBeTruthy();
    expect(err({ dobD: '5', dobM: '', dobY: '', age: '' }).age).toBeUndefined(); // one clear error, not two
  });
  it('emergency contact needs a valid number and a relation', () => {
    expect(err({ emergNo: '123' }).emergNo).toBeTruthy();
    expect(err({ emergNo: '9840011223' }).emergRel).toBeTruthy();
    expect(err({ emergNo: '9840011223', emergRel: 'Wife' })).toEqual({});
  });
  it('office and doctor phones: 10–11 digits', () => {
    expect(err({ office: '123456789' }).office).toBeTruthy();
    expect(err({ office: '04422223333', physPh: '9840011223' })).toEqual({});
    expect(err({ physPh: '123456789012' }).physPh).toBeTruthy();
  });
  it('email format', () => {
    expect(err({ email: 'a@b' }).email).toBeTruthy();
    expect(err({ email: 'a@b.in' }).email).toBeUndefined();
  });
  it('DOB not in the future, age 0–120', () => {
    expect(err({ dob: addDays(t, 1) }).dob).toBeTruthy();
    expect(err({ dob: '1800-01-01' }).dob).toBeTruthy();
    expect(err({ dob: '1990-05-05', age: '' })).toEqual({});
    expect(err({ age: '121' }).age).toBeTruthy();
    expect(err({ age: '0' }).age).toBeUndefined();
    expect(err({ age: '3.5' }).age).toBeTruthy();
  });
  it('someone else filling the form must give name and relationship', () => {
    expect(Object.keys(err({ forOther: true }))).toEqual(['oName', 'oRel']);
  });
  it('an existing patient does not need to sign again', () => expect(err({ sig: false, id: 'p1' })).toEqual({}));
  it('warns when the mobile belongs to a different name', () => {
    const p = db.patients[0];
    expect(mobileClash(db, { ...valid(), mobile: p.mobile }).id).toBe(p.id);
    expect(mobileClash(db, { ...valid(), mobile: p.mobile, name: p.name })).toBeUndefined();
  });
  it('bookings in the past are blocked', () => {
    expect(validateBooking({ date: addDays(t, -1), time: '10:00' }).d).toBeTruthy();
    expect(validateBooking({ date: t, time: '00:00' }).d).toBeTruthy();
    expect(validateBooking({ date: addDays(t, 1), time: '10:00' })).toEqual({});
    expect(Object.keys(validateBooking({ date: addDays(t, 1), time: '10:00', isNew: true, newName: '', newPhone: '123' }))).toEqual(['n', 'm']);
  });
});

describe('Reg. No. allocation', () => {
  it('starts at 6001 and increases', () => {
    const d = { nextReg: 6001, patients: [] };
    expect([allocReg(d), allocReg(d), allocReg(d)]).toEqual([6001, 6002, 6003]);
  });
  it('gives each new patient the next number and reuses an exact duplicate', () => {
    const next = db.nextReg, a = savePatient(db, valid()), b = savePatient(db, { ...valid(), name: 'Bala K', mobile: '9876500000' });
    expect([a.reg, b.reg, db.nextReg]).toEqual([next, next + 1, next + 2]);
    expect(savePatient(db, valid()).id).toBe(a.id);
    expect(db.nextReg).toBe(next + 2);
  });
  it('tablet and QR forms start unverified; pregnancy flags only for women', () => {
    const p = savePatient(db, { ...valid(), preg: true }, { verified: false });
    expect(p.verified).toBe(false);
    expect(p.preg).toBe(false);
  });
});

describe('Excel import', () => {
  const sheet = () => { const wb = XLSX.read(readFileSync('reference/sample-old-patient-records.xlsx')); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true }); };
  const parsed = () => parseSheet(sheet(), db.patients.map((p) => p.reg));
  it('reads dates in every supported form', () => {
    expect(xlDate(46001)).toBe('2025-12-10');
    expect(xlDate('11/12/2025')).toBe('2025-12-11');
    expect(xlDate('3-2-64')).toBe('1964-02-03');
    expect(xlDate('2002-7-8')).toBe('2002-07-08');
    expect(xlDate('31/02/2020')).toBe('');
    expect(xlDate('soon')).toBe('');
    expect(xlDate('')).toBe('');
  });
  it('parses the sample file: 4 to import, 2 skipped', () => {
    const rows = parsed();
    expect(importCounts(rows)).toEqual({ total: 6, ok: 4, fresh: 4, update: 0, skipped: 2, notes: 1 });
    const by = Object.fromEntries(rows.map((r) => [r.line, r]));
    expect(by[2]).toMatchObject({ reg: 5826, name: 'Ramya S', mobile: '9840012345', date: '2025-12-10', dob: '1996-05-12', sex: 'F', age: 29 });
    expect(by[3]).toMatchObject({ mobile: '9840054321', date: '2025-12-11', dob: '' });
    expect(by[4]).toMatchObject({ mobile: '', land: '04422223333', sex: 'F', dob: '1964-02-03' });
    expect(by[4].warn[0]).toMatch(/landline/);
    expect(by[5].issues).toEqual(['Name is empty']);
    expect(by[6]).toMatchObject({ mobile: '9876501234', sex: 'M' });
    expect(by[7].issues).toEqual(['Reg No. is not a number']);
  });
  it('handles +91, bad mobiles, missing Reg No. and a header row', () => {
    const rows = parseSheet([['Reg No', 'Date', 'Name'], ['7001', '', 'A B', '', '+91 98765 43210'], ['', '', 'No Reg'], [7002, '', 'C D', '', '12345', '', '', 'x']]);
    expect(rows.length).toBe(3);
    expect(rows[0].mobile).toBe('9876543210');
    expect(rows[1].issues).toEqual(['Reg No. is missing']);
    expect(rows[2].warn.length).toBe(2);
  });
  it('creates patients with a legacy visit, bumps the next Reg No., and updates on re-import', () => {
    db.nextReg = 5000;
    expect(applyImport(db, parsed())).toEqual({ fresh: 4, updated: 0 });
    const p = db.patients.find((x) => x.reg === 5828);
    expect(p).toMatchObject({ imported: true, office: '04422223333', mobile: '', verified: true });
    expect(db.visits.find((v) => v.pid === p.id)).toMatchObject({ legacy: true, total: 0, date: '2025-12-14' });
    expect(db.nextReg).toBe(Math.max(...db.patients.map((x) => x.reg)) + 1);
    expect(applyImport(db, parsed())).toEqual({ fresh: 0, updated: 4 });
  });
  it('exports the same columns with dd/mm/yyyy dates', () => {
    applyImport(db, parsed());
    const rows = exportRows(db);
    expect(Object.keys(rows[0])).toEqual(['Reg No.', 'Date', 'Name', 'Treatment', 'Mobile Number', 'Address', 'Age', 'Sex', 'DOB']);
    expect(rows[0]).toMatchObject({ 'Reg No.': 5826, Date: '10/12/2025', Treatment: 'Scaling', DOB: '12/05/1996' });
    expect(rows.find((r) => r['Reg No.'] === 5827).DOB).toBe('');
  });
});

describe('follow-ups', () => {
  it('to call → called → back → closed', () => {
    const { toCall, called } = callLists(db), v = toCall[0], n = toCall.length, c = called.length;
    markCalled(db, v.id);
    expect(v).toMatchObject({ fu: 'contacted', calledOn: t });
    expect([callLists(db).toCall.length, callLists(db).called.length]).toEqual([n - 1, c + 1]);
    moveBack(db, v.id);
    expect([callLists(db).toCall.length, callLists(db).called.length]).toEqual([n, c]);
    closeFU(db, v.id);
    expect(callLists(db).toCall.length).toBe(n - 1);
    expect(dueFU(db).includes(v)).toBe(false);
  });
  it('booking clears the patient from both lists', () => {
    const v = callLists(db).called[0];
    expect(bookAppt(db, v.pid, addDays(t, 20), '09:00', 'Review').ok).toBe(true);
    expect(v.fu).toBe('booked');
    const l = callLists(db);
    expect([...l.toCall, ...l.called].some((x) => x.pid === v.pid)).toBe(false);
  });
  it('double bookings are blocked', () => {
    expect(bookAppt(db, 'p5', addDays(t, 20), '09:00', '').ok).toBe(true);
    expect(bookAppt(db, 'p6', addDays(t, 20), '09:00', '').ok).toBe(false);
  });
});

describe('audit fixes', () => {
  it('a cancelled booking puts the patient back on the call list', () => {
    const v = callLists(db).toCall.find((x) => !db.appointments.some((a) => a.pid === x.pid && a.status === 'booked'));
    bookAppt(db, v.pid, addDays(t, 20), '09:00', 'Review');
    expect(callLists(db).toCall.includes(v)).toBe(false);
    expect(cancelBooking(db, db.appointments.at(-1).id).ok).toBe(true);
    expect(callLists(db).toCall.includes(v)).toBe(true);
    expect(cancelBooking(db, db.appointments.at(-1).id).ok).toBe(false); // already cancelled
  });
  it('a new caller with a family member’s mobile becomes a new patient, not the relative', () => {
    const rel = db.patients[5], n = db.patients.length;
    const r = submitBooking(db, { pid: 'new', newName: 'Totally Different', newPhone: rel.mobile, date: addDays(t, 30), time: '09:00', reason: '' });
    expect(r.msg).toMatch(/Booked Totally Different/);
    expect(db.patients.length).toBe(n + 1);
    expect(submitBooking(db, { pid: 'new', newName: rel.name, newPhone: rel.mobile, date: addDays(t, 31), time: '09:00', reason: '' }).msg).toContain(rel.name);
    expect(db.patients.length).toBe(n + 1);
  });
  it('the same patient cannot be booked twice on one day', () => {
    expect(bookAppt(db, 'p5', addDays(t, 40), '09:00', '').ok).toBe(true);
    expect(bookAppt(db, 'p5', addDays(t, 40), '10:00', '').msg).toMatch(/already booked at 09:00/);
  });
  it('offers the first free slot', () => {
    const day = addDays(t, 50);
    expect(firstFree(db, day)).toBe('09:00');
    bookAppt(db, 'p5', day, '09:00', ''); bookAppt(db, 'p6', day, '09:30', '');
    expect(firstFree(db, day)).toBe('10:00');
    expect(coInit(db, tq(db).find((q) => q.status === 'checkout').id).time).toBe(firstFree(db, addDays(t, 7)));
  });
  it('a re-submitted form updates the record and goes back to "to check"', () => {
    const a = savePatient(db, valid()), again = savePatient(db, { ...valid(), allergy: 'Latex', med: ['Diabetes'] }, { verified: false });
    expect(again.id).toBe(a.id);
    expect(again).toMatchObject({ allergy: 'Latex', med: ['Diabetes'], verified: false });
  });
  it('old imported records can be edited without a mobile or complaint', () => {
    const old = { ...valid(), id: 'x', imported: true, mobile: '', complaint: '', office: '04422223333', sig: false };
    expect(validateReg(old)).toEqual({});
    expect(validateReg({ ...old, office: '' }).mobile).toBeTruthy();
    expect(validateReg({ ...valid(), sig: false, paperSig: true })).toEqual({}); // signed on paper at the desk
  });
  it('import rejects duplicate, out-of-range and mismatched Reg Nos and impossible dates', () => {
    const rows = parseSheet([[9001, '', 'A B'], [9001, '', 'C D'], ['99999999999999999999', '', 'Big'], [0, '', 'Zero'], [6003, '', 'Wrong Person'], [6003.0, '', 'Meena Krishnan']], db.patients);
    expect(rows.map((r) => r.issues.length > 0)).toEqual([false, true, true, true, true, true]);
    expect(rows[4].issues[0]).toMatch(/already belongs to Meena Krishnan/);
    expect(xlDate('05/13/2020')).toBe('');
    expect(xlDate('2024-13-45')).toBe('');
    expect(xlDate('29/02/2024')).toBe('2024-02-29');
  });
  it('a new plan with a next visit stays open; the patient in the chair can be moved back', () => {
    const cur = curQ(db);
    expect(backToWaiting(db, cur.id).ok).toBe(true);
    expect(curQ(db)).toBeUndefined();
    expect(removeFromQueue(db, cur.id).ok).toBe(true);
    expect(tq(db).some((q) => q.id === cur.id)).toBe(false);
    const next = nextWaiting(db); sendIn(db, next.id);
    handOver(db, { pid: next.pid, caseId: 'new', recs: [{ svcId: '', name: 'RCT – molar', teeth: '36', price: '' }], nextIn: '7', nextReason: 'PFM crown', close: false, notes: 'Access opening done.' });
    expect(db.cases.at(-1).status).toBe('open');
    expect(db.visits.at(-1).notes).toBe('Access opening done.');
  });
  it('choosing a planned treatment from the list ticks the plan instead of duplicating it', () => {
    const cur = curQ(db), c = db.cases.find((x) => x.pid === cur.pid && x.title === 'Sensitivity – 25'), n = c.items.length;
    handOver(db, { pid: cur.pid, caseId: c.id, recs: [{ svcId: '', name: 'Composite filling', teeth: '25', price: '1200', planItemId: null }], close: false });
    expect(c.items.length).toBe(n);
    expect(c.items.find((x) => x.name === 'Composite filling').done).toBe(true);
  });
  it('milk teeth are accepted', () => {
    const cur = curQ(db);
    expect(handOver(db, { pid: cur.pid, caseId: 'new', recs: [{ svcId: '', name: 'Pulpectomy (child)', teeth: '54, 85', price: '' }], close: true }).ok).toBe(true);
  });
  it('collecting more than the balance is refused', () => {
    const owes = db.patients.find((p) => bal(db, p.id) > 0);
    expect(payDue(db, owes.id, bal(db, owes.id) + 1, 'Cash').ok).toBe(false);
    expect(payDue(db, owes.id, 10.5, 'Cash').ok).toBe(false);
  });
  it('a second visit on the same day does not double the day’s collection', () => {
    const before = registerRows(db, t).reduce((s, r) => s + r.pay, 0);
    addToQueue(db, 'p16', 'Walk-in'); // already finished and paid today
    const rows = registerRows(db, t);
    expect(rows.reduce((s, r) => s + r.pay, 0)).toBe(before);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rows.at(-1).planned || rows.filter((r) => r.pid === 'p16').some((r) => r.planned)).toBe(true);
  });
  it('search ignores spaces, +91 and a leading 0 in mobile numbers', () => {
    const p = db.patients.find((x) => x.id === 'pnew');
    for (const q of ['98845 61200', '+919884561200', '09884561200', 'saranya', '6039']) expect(findPatients(db, q).some((x) => x.id === p.id)).toBe(true);
    expect(findPatients(db, 'x')).toEqual([]);
  });
  it('nothing in the sample clinic is dated in the future', () => {
    expect(db.visits.filter((v) => v.date > t)).toEqual([]);
    expect(db.payments.filter((x) => x.date > t)).toEqual([]);
  });
});

describe('lab work: measurement → waiting for supplier → arrived → fitted', () => {
  const crown = () => db.services.find((s) => s.name === 'PFM crown');
  const seePatient = (recs, extra = {}) => { const cur = curQ(db); const r = handOver(db, { pid: cur.pid, caseId: 'new', recs, close: false, ...extra }); return { cur, r }; };
  const rec = (when, price = '4000') => ({ svcId: crown().id, name: 'PFM crown', teeth: '36', price, when });
  it('the sample clinic has lab work in each stage, and reception is told', () => {
    expect(db.labOrders.map((o) => o.status).sort()).toEqual(['arrived', 'waiting', 'waiting']);
    expect(labOverdue(db)).toHaveLength(1);
    expect(labToCall(db)).toHaveLength(1);
    const texts = frontNotices(db).map((n) => n.text).join(' | ');
    expect(texts).toMatch(/Lab work arrived, call for fitting/);
    expect(texts).toMatch(/Lab work overdue from the supplier/);
    expect(crown().lab).toBe(true);
  });
  it('recording "measurement taken" creates the lab item and keeps the plan open', () => {
    const { cur } = seePatient([rec('measure')]);
    const o = labFor(db, cur.pid).at(-1), v = db.visits.at(-1), c = db.cases.at(-1);
    expect(o).toMatchObject({ status: 'waiting', name: 'PFM crown', teeth: ['36'], measuredOn: t });
    expect(o.expected > t).toBe(true);
    expect(v.services[0]).toMatchObject({ step: 'Measurement taken', price: 4000 });
    expect(c.status).toBe('open');
    expect(c.items[0].done).toBe(false);
    expect(db.charts[cur.pid]?.['36']).toBeUndefined(); // no crown on the chart until it is fitted
    expect(priceApprovals(db, [{ ...v.services[0], price: 1000 }], cur.pid, t)).toEqual([]); // split prices are not "changed prices"
  });
  it('supplier details are saved, the charge is booked once as a Lab expense, arrival is recorded', () => {
    const { cur } = seePatient([rec('measure')]);
    const o = labFor(db, cur.pid).at(-1), n = db.expenses.length;
    setLabDetails(db, o.id, { lab: 'Precision Dental Lab', expected: addDays(t, 5), cost: '1800' });
    setLabDetails(db, o.id, { lab: 'Precision Dental Lab', expected: addDays(t, 6), cost: '1800' });
    expect(db.expenses.length).toBe(n + 1);
    expect(db.expenses.at(-1)).toMatchObject({ category: 'Lab', amount: 1800, vendor: 'Precision Dental Lab' });
    expect(markArrived(db, o.id).ok).toBe(true);
    expect(markArrived(db, o.id).ok).toBe(false);
    expect(labToCall(db).some((x) => x.id === o.id)).toBe(false); // still in today's queue (at checkout)
    bookAppt(db, cur.pid, addDays(t, 2), '09:00', 'PFM crown 36 fitting');
    expect(labToCall(db).some((x) => x.id === o.id)).toBe(false); // booked: nothing to chase
  });
  it('fitting closes the lab item, marks the chart and finishes the plan item', () => {
    const { cur } = seePatient([rec('measure')]);
    const o = labFor(db, cur.pid).at(-1), c = db.cases.at(-1);
    markArrived(db, o.id);
    checkout(db, { ...coInit(db, cur.id), paid: '2000' });
    const owed = bal(db, cur.pid);
    addToQueue(db, cur.pid, 'Walk-in'); sendIn(db, tq(db).at(-1).id);
    handOver(db, { pid: cur.pid, caseId: c.id, recs: [{ ...rec('fit', '0'), planItemId: c.items[0].id }], close: true });
    expect(o).toMatchObject({ status: 'fitted', fittedOn: t });
    expect(c.items[0].done).toBe(true);
    expect(c.status).toBe('closed');
    expect(db.charts[cur.pid]['36']).toBe('crown');
    expect(db.visits.at(-1).services[0]).toMatchObject({ step: 'Fitted', price: 0 });
    expect(bal(db, cur.pid)).toBe(owed); // charged once, at the measurement visit
    expect(labFor(db, cur.pid)).toEqual([]);
  });
  it('a treatment can be planned for later without being charged today', () => {
    const { r, cur } = seePatient([{ svcId: '', name: 'Consultation', teeth: '', price: '200', when: 'done' }, rec('later')]);
    expect(r.ok).toBe(true);
    const v = db.visits.at(-1), c = db.cases.at(-1);
    expect(v.services.map((s) => s.name)).toEqual(['Consultation']);
    expect(c.items.map((x) => [x.name, x.done])).toEqual([['Consultation', true], ['PFM crown', false]]);
    expect(labFor(db, cur.pid)).toEqual([]);
    expect(handOver(db, { pid: 'p2', caseId: 'new', recs: [rec('later')] }).ok).toBe(false);
  });
  it('the doctor can take a visit back; everything it did is undone', () => {
    const before = { cases: db.cases.length, visits: db.visits.length, lab: db.labOrders.length };
    const { cur } = seePatient([rec('measure')], { rx: 'Paracetamol', remarks: 'r' });
    const back = takeBack(db, cur.id);
    expect(back.ok).toBe(true);
    expect({ cases: db.cases.length, visits: db.visits.length, lab: db.labOrders.length }).toEqual(before);
    expect(curQ(db).id).toBe(cur.id);
    expect(back.draft).toMatchObject({ rx: 'Paracetamol', remarks: 'r', caseId: 'new' });
    expect(back.draft.recs[0]).toMatchObject({ name: 'PFM crown', teeth: '36', price: '4000', when: 'measure' });
    expect(takeBack(db, cur.id).ok).toBe(false);
  });
  it('reception can reopen a saved checkout; the payment and booking are undone', () => {
    const { cur } = seePatient([{ svcId: '', name: 'Consultation', teeth: '', price: '200', when: 'done' }]);
    const start = bal(db, cur.pid);
    checkout(db, { ...coInit(db, cur.id), paid: '2000', nextMode: 'book', date: addDays(t, 12), time: '09:00', reason: 'Review' });
    const appt = db.appointments.at(-1);
    expect(reopenCheckout(db, cur.id).ok).toBe(true);
    expect(bal(db, cur.pid)).toBe(start);
    expect(appt.status).toBe('cancelled');
    expect(db.queue.find((x) => x.id === cur.id).status).toBe('checkout');
    expect(checkout(db, { ...coInit(db, cur.id), paid: '200' }).ok).toBe(true);
  });
  it('a wrong balance payment can be removed; visit payments cannot', () => {
    const owes = db.patients.find((p) => bal(db, p.id) > 500), b = bal(db, owes.id);
    payDue(db, owes.id, 500, 'Cash');
    expect(deletePayment(db, db.payments.at(-1).id).ok).toBe(true);
    expect(bal(db, owes.id)).toBe(b);
    expect(deletePayment(db, db.payments.find((x) => x.visitId).id).ok).toBe(false);
  });
  it('cancelling a lab item removes it from the lists', () => {
    const o = db.labOrders.find((x) => x.status === 'arrived');
    cancelLab(db, o.id);
    expect(labToCall(db)).toEqual([]);
  });
});

describe('form sent from the patient’s own phone', () => {
  it('survives the round trip through a link', () => {
    const r = { ...valid(), name: 'Anbu Selvan', med: ['Diabetes'], allergy: 'Penicillin', address: '12, காந்தி தெரு, Selaiyur', preg: false };
    const { form, error } = unpackForm(packForm(r), MED);
    expect(error).toBeUndefined();
    expect(form).toMatchObject({ name: 'Anbu Selvan', mobile: '9876543210', med: ['Diabetes'], allergy: 'Penicillin', address: '12, காந்தி தெரு, Selaiyur', consent: true, paperSig: true });
    expect(packForm(r)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('rejects damaged, incomplete or made-up links', () => {
    expect(unpackForm('not-a-form', MED).error).toMatch(/damaged/);
    expect(unpackForm(packForm({ ...valid(), mobile: '123' }), MED).error).toMatch(/incomplete/);
    const odd = unpackForm(packForm({ ...valid(), med: ['Diabetes', '<script>'], extra: 'x' }), MED).form;
    expect(odd.med).toEqual(['Diabetes']);
    expect(odd.extra).toBeUndefined();
    expect(unpackForm(packForm({ ...valid(), sig: false, typedSig: '' }), MED).error).toMatch(/sign/);
  });
});

describe('small rules', () => {
  it('stock-in errors are per field; a typed name counts as a signature', () => {
    expect(Object.keys(stockInErrors({ itemId: '', name: '', qty: '0', cost: '', min: '', date: addDays(t, 1), expiry: addDays(t, -1) })).sort()).toEqual(['cost', 'date', 'expiry', 'min', 'name', 'qty']);
    expect(validateReg({ ...valid(), sig: false, typedSig: 'Anbu Selvan' })).toEqual({});
    expect(savePatient(db, { ...valid(), sig: false, typedSig: 'Anbu Selvan' })).toMatchObject({ sig: true, typedSig: 'Anbu Selvan' });
  });
});

describe('inventory', () => {
  const item = (batches, min = 2) => ({ id: 'x', name: 'X', unit: 'box', cat: 'Other', min, batches: batches.map(([qty, expiry], i) => ({ id: 'b' + i, qty, expiry })) });
  it('status: expired, out, low, expiring, ok', () => {
    expect(invStatus(item([[5, addDays(t, -1)]]))[1]).toBe('Expired');
    expect(invStatus(item([[0, '']]))[1]).toBe('Out of stock');
    expect(invStatus(item([[2, '']]))[1]).toBe('Low stock');
    expect(invStatus(item([[9, addDays(t, 30)]]))[1]).toBe('Expires soon');
    expect(invStatus(item([[9, addDays(t, 31)]]))[1]).toBe('OK');
    expect(invStatus(item([[9, '']]))[1]).toBe('OK');
    expect(invStatus(item([[0, addDays(t, -9)], [9, '']]))[1]).toBe('OK'); // an empty expired batch does not count
  });
  it('uses the earliest expiry first and warns at the alert level', () => {
    const it0 = item([[4, addDays(t, 200)], [3, addDays(t, 40)], [5, '']], 6), d = { inventory: [it0], invLog: [] };
    expect(takeStock(d, 'x', 5)).toMatchObject({ ok: true, low: false });
    expect(it0.batches.map((b) => b.qty)).toEqual([2, 0, 5]);
    expect(takeStock(d, 'x', 1)).toMatchObject({ ok: true, low: true });
    expect(takeStock(d, 'x', 99).ok).toBe(false);
    expect(takeStock(d, 'x', 0).ok).toBe(false);
    expect(invQty(it0)).toBe(6);
    expect(d.invLog.map((l) => l.qty)).toEqual([5, 1]);
  });
  it('stock in validates and books the cost as an expense', () => {
    const ok = { itemId: '', name: 'Cotton rolls', cat: 'Disposables', unit: 'pack', qty: '10', cost: '450', vendor: 'Sri', date: t, expiry: '', min: '3' };
    expect(validateStockIn(ok)).toBe('');
    for (const bad of [{ qty: '0' }, { qty: '1.5' }, { qty: '' }, { cost: '' }, { expiry: addDays(t, -1) }, { min: '' }, { name: ' ' }]) expect(validateStockIn({ ...ok, ...bad })).not.toBe('');
    const n = db.expenses.length, it1 = stockIn(db, ok);
    expect(invQty(it1)).toBe(10);
    expect(db.expenses.length).toBe(n + 1);
    expect(db.expenses.at(-1)).toMatchObject({ amount: 450, category: 'Consumables', item: 'Cotton rolls × 10' });
    expect(invStatus(it1)[1]).toBe('OK');
  });
});

describe('the visit flow', () => {
  const finishCurrent = () => { const cur = curQ(db); handOver(db, { pid: cur.pid, caseId: 'new', recs: [{ svcId: '', name: 'Consultation', teeth: '', price: '200' }], rx: '', nextIn: '', nextReason: '', close: null }); return cur; };
  it('only one patient can be with the doctor', () => {
    const next = nextWaiting(db);
    expect(sendIn(db, next.id).ok).toBe(false);
    finishCurrent();
    expect(sendIn(db, next.id).ok).toBe(true);
    expect(curQ(db).id).toBe(next.id);
  });
  it('a patient cannot be queued twice; an appointment is checked in', () => {
    expect(addToQueue(db, 'p1', 'Walk-in').ok).toBe(false);
    const r = addToQueue(db, 'p9', 'Walk-in');
    expect(r).toMatchObject({ ok: true, token: 8 });
    expect(tq(db).at(-1).source).toBe('Appointment');
    expect(db.appointments.find((a) => a.pid === 'p9' && a.date === t).status).toBe('checked-in');
  });
  it('hand over: blank price waits for reception, typed "Other" becomes a service, chart is marked', () => {
    const cur = curQ(db), n = db.services.length;
    expect(handOver(db, { pid: cur.pid, caseId: 'new', recs: [{ svcId: '', name: '', teeth: '', price: '' }] }).ok).toBe(false);
    const r = handOver(db, { pid: cur.pid, caseId: 'new', recs: [{ svcId: db.services.find((s) => s.name === 'Composite filling').id, name: 'Composite filling', teeth: '25', price: '' }, { svcId: 'other', name: 'Desensitising varnish', teeth: '', price: '300' }], rx: 'x', nextIn: '7', nextReason: 'Review', close: null, remarks: 'ok' });
    expect(r.ok).toBe(true);
    const q = db.queue.find((x) => x.id === cur.id), v = db.visits.find((x) => x.id === q.visitId);
    expect(q.status).toBe('checkout');
    expect(v.services.map((s) => s.price)).toEqual([null, 300]);
    expect(v).toMatchObject({ total: 300, stage: 'checkout', suggest: '7', remarks: 'ok' });
    expect(db.services.length).toBe(n + 1);
    expect(db.services.at(-1)).toMatchObject({ name: 'Desensitising varnish', byDoctor: true });
    expect(db.charts[cur.pid]['25']).toBe('filled');
    expect(curQ(db)).toBeUndefined();
  });
  it('hand over rejects teeth that do not exist and negative prices', () => {
    const cur = curQ(db), rec = (patch) => ({ pid: cur.pid, caseId: 'new', recs: [{ svcId: '', name: 'Consultation', teeth: '', price: '200', ...patch }] });
    expect(handOver(db, rec({ teeth: '19' })).ok).toBe(false);
    expect(handOver(db, rec({ teeth: 'abc' })).ok).toBe(false);
    expect(handOver(db, rec({ price: '-5' })).ok).toBe(false);
    expect(handOver(db, rec({ teeth: '18, 48' })).ok).toBe(true);
  });
  it('checkout: needs every price, takes a part payment, books the next visit', () => {
    const cur = finishCurrent(), co = coInit(db, cur.id), before = bal(db, cur.pid);
    co.lines[0].price = null;
    expect(checkout(db, { ...co, paid: '0' }).ok).toBe(false);
    co.lines[0].price = -1;
    expect(checkout(db, { ...co, paid: '0' }).ok).toBe(false);
    co.lines[0].price = 200;
    expect(checkout(db, co).ok).toBe(false); // amount not entered
    expect(checkout(db, { ...co, paid: '-10' }).ok).toBe(false);
    const r = checkout(db, { ...co, paid: '50', mode: 'Cash', nextMode: 'book', date: addDays(t, 9), time: '09:30', reason: 'Review' });
    expect(r.ok).toBe(true);
    expect(bal(db, cur.pid)).toBe(before - 50);
    expect(db.queue.find((x) => x.id === cur.id).status).toBe('done');
    expect(db.appointments.at(-1)).toMatchObject({ pid: cur.pid, date: addDays(t, 9), time: '09:30', status: 'booked' });
    expect(db.visits.at(-1)).toMatchObject({ fu: 'booked', stage: 'closed' });
  });
});

describe('price approval trigger', () => {
  const lines = (price) => [{ name: 'Composite filling', teeth: [], price }];
  it('raises one approval when the price differs from the list', () => {
    expect(priceApprovals(db, lines(1200), 'p1', t)).toEqual([]);
    const a = priceApprovals(db, lines(1000), 'p1', t);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ name: 'Composite filling', old: 1200, price: 1000, status: 'pending' });
  });
  it('does not duplicate a pending approval or flag unknown services', () => {
    expect(priceApprovals(db, [{ name: 'Scaling & polishing', teeth: [], price: 900 }], 'p1', t)).toEqual([]); // seed already has one pending
    expect(priceApprovals(db, [...lines(1000), ...lines(900)], 'p1', t)).toHaveLength(1);
    expect(priceApprovals(db, [{ name: 'Something new', teeth: [], price: 5 }], 'p1', t)).toEqual([]);
  });
  it('approving makes it the default; keeping leaves the list price', () => {
    const [a] = db.approvals, svc = db.services.find((s) => s.id === a.svcId);
    decideApproval(db, a.id, false);
    expect(svc.price).toBe(1200);
    a.status = 'pending';
    decideApproval(db, a.id, true);
    expect(svc.price).toBe(1500);
  });
});

describe('KPIs', () => {
  it('match the seeded day', () => {
    const k = kpiNumbers(db);
    expect(k).toMatchObject({ patientsToday: 7, seen: 3, waiting: 3, collectedToday: 800, paymentsToday: 1, avgChair: 22, timedVisits: 3, activeOrtho: 7, newPatients: 1, stockAlerts: 6 });
    expect(k.netMonth).toBe(k.collectedMonth - k.spentMonth);
    expect(kpis(db)).toHaveLength(10);
  });
  it('move with payments, expenses and stock', () => {
    const a = kpiNumbers(db), owes = db.patients.find((p) => bal(db, p.id) >= 100);
    payDue(db, owes.id, 100, 'UPI');
    db.expenses.push({ id: 'e', date: t, category: 'Other', item: 'x', amount: 40 });
    const b = kpiNumbers(db);
    expect(b.collectedToday).toBe(a.collectedToday + 100);
    expect(b.collectedMonth).toBe(a.collectedMonth + 100);
    expect(b.dues).toBe(a.dues - 100);
    expect(b.spentMonth).toBe(a.spentMonth + 40);
    expect(b.netMonth).toBe(a.netMonth + 60);
  });
});
