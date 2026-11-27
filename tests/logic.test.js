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
import { addToQueue, bookAppt, sendIn, handOver, coInit, checkout, payDue, decideApproval } from '../src/data/actions.js';
import { curQ, tq, nextWaiting } from '../src/data/selectors.js';

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
