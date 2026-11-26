// Deterministic sample clinic, relative to today. Ported from the approved prototype.
import { today, addDays, sum } from '../logic/format.js';
import { repDefaults } from '../logic/report.js';
import { RX, DOCTOR } from './constants.js';

export function seed() {
  const t = today(), d = (n) => addDays(t, n);
  let k = 0; const uid = () => (++k).toString(36);
  const rnd = (() => { let s = 20261125; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const S = (cat, name, price, marks, note) => ({ id: 's' + uid(), cat, name, price, marks: marks || '', note: note || '', active: true });
  const services = [
    S('g', 'Consultation', 200, '', 'Examined, advised.'), S('g', 'IOPA X-ray', 250, ''), S('g', 'OPG', 600, ''), S('g', 'Scaling & polishing', 1200, '', 'Full mouth scaling and polishing done.'),
    S('g', 'Composite filling', 1200, 'filled', 'Caries removed, composite restoration done.'), S('g', 'GIC filling', 800, 'filled', 'GIC restoration done.'),
    S('g', 'RCT – anterior', 3500, 'rct', 'Access opening, BMP, obturation.'), S('g', 'RCT – molar', 5000, 'rct', 'Access opening, BMP, obturation.'), S('g', 'Pulpectomy (child)', 2000, 'rct'),
    S('g', 'Extraction', 800, 'missing', 'Extracted under LA, haemostasis achieved.'), S('g', 'Surgical / impaction extraction', 3000, 'missing', 'Surgical extraction, sutures placed.'),
    S('g', 'PFM crown', 4000, 'crown'), S('g', 'Zirconia crown', 10000, 'crown'), S('g', 'Removable partial denture', 3000, ''), S('g', 'Complete denture', 15000, ''),
    S('g', 'Implant', 25000, 'implant'), S('g', 'Fluoride application', 500, ''), S('g', 'Pit & fissure sealant', 600, ''), S('g', 'Teeth whitening', 6000, ''), S('g', 'Review', 0, '', 'Review done, healing satisfactory.'),
    S('o', 'Ortho consultation', 300, ''), S('o', 'Ortho records (photos, models, ceph)', 1500, ''), S('o', 'Metal braces package', 35000, '', 'Brackets bonded, archwire placed.'),
    S('o', 'Ceramic braces package', 50000, ''), S('o', 'Self-ligating braces package', 60000, ''), S('o', 'Clear aligners package', 120000, ''),
    S('o', 'Monthly adjustment', 0, '', 'Wire changed, elastics advised.'), S('o', 'Removable appliance', 6000, ''), S('o', 'Debonding', 0, ''), S('o', 'Retainer', 4000, '')];
  const sv = (n) => services.find((s) => s.name === n);
  const NAMES = [['Mrs.', 'Lakshmi Ramesh', 'F'], ['Mr.', 'Arjun Selvam', 'M'], ['Mrs.', 'Meena Krishnan', 'F'], ['Mr.', 'Karthik Raja', 'M'], ['Mrs.', 'Fathima Begum', 'F'], ['Mr.', 'S. Manoharan', 'M'], ['Ms.', 'Priya Venkatesh', 'F'], ['Mr.', 'Ganesh Kumar', 'M'], ['Ms.', 'Divya Subramanian', 'F'], ['Mr.', 'Ravi Shankar', 'M'],
    ['Ms.', 'Kavya Murugan', 'F'], ['Mr.', 'Senthil Nathan', 'M'], ['Mrs.', 'Anitha Balaji', 'F'], ['Mr.', 'Harish Prabhu', 'M'], ['Mrs.', 'Revathi Sundaram', 'F'], ['Mr.', 'Mohammed Irfan', 'M'], ['Mrs.', 'Sangeetha Mohan', 'F'], ['Mr.', 'Vignesh Kumar', 'M'], ['Mrs.', 'Kavitha Ramesh', 'F'], ['Mr.', 'Balaji Venkat', 'M'],
    ['Ms.', 'Nandhini P', 'F'], ['Mr.', 'Ashok Rajan', 'M'], ['Mrs.', 'Gayathri Vasan', 'F'], ['Mr.', 'Prakash Anand', 'M'], ['Ms.', 'Lavanya R', 'F'], ['Master', 'Rohit Kannan', 'M'], ['Mrs.', 'Shalini K', 'F'], ['Mr.', 'Murali Dharan', 'M'], ['Ms.', 'Janani Sekar', 'F'], ['Mr.', 'Suresh Babu', 'M'],
    ['Mrs.', 'Deepa Raghavan', 'F'], ['Mr.', 'Manoj Kumar', 'M'], ['Ms.', 'Swetha Iyer', 'F'], ['Mr.', 'Raghu Raman', 'M'], ['Mrs.', 'Kamala Devi', 'F'], ['Mr.', 'Dinesh Pandian', 'M'], ['Ms.', 'Aishwarya N', 'F'], ['Mr.', 'Sathish Kumar', 'M']];
  const AREAS = ['Kamarajapuram', 'Selaiyur', 'Camp Road', 'East Tambaram', 'Chitlapakkam', 'Sembakkam', 'Rajakilpakkam', 'Madambakkam', 'Gowrivakkam', 'Tambaram'];
  const ORTHO = [1, 3, 6, 10, 13, 25, 32];
  const MEDS = [[], [], [], ['Blood Pressure'], [], ['Diabetes'], [], ['Diabetes', 'Blood Pressure'], [], ['Asthma/Breathing Problems'], [], ['Heart Problems'], [], ['Hormonal Problems']];
  const COMPL = ['Tooth pain', 'Sensitivity', 'Bleeding gums', 'Broken tooth', 'Cleaning', 'Missing teeth', 'Black spot on tooth', 'Wisdom tooth pain', 'Loose tooth', 'Bad breath'];
  const patients = NAMES.map(([title, name, sex], i) => {
    const o = ORTHO.includes(i), age = o ? 13 + (i % 9) : 22 + Math.floor(rnd() * 48);
    const dob = `${new Date().getFullYear() - age - 1}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`;
    return { id: 'p' + (i + 1), reg: 6001 + i, created: d(-150 + i * 3), title, name, sex, age, dob, mobile: '9' + String(Math.floor(100000000 + rnd() * 899999999)),
      address: `${3 + i * 2}, ${pick(['2nd Street', 'Main Road', 'Gandhi Street', 'Nehru Street', 'Lake View Road'])}, ${pick(AREAS)}, Chennai`, emerg: '', email: '', prof: o ? 'Student' : pick(['Teacher', 'Homemaker', 'IT professional', 'Business', 'Retired', 'Driver', 'Nurse']),
      office: '', ref: pick(['', '', 'Friend', 'Family', 'Google']), phys: '', physPh: '', med: o ? [] : MEDS[i % MEDS.length], other: '', preg: false, nurse: false, allergy: i % 9 === 4 ? 'Penicillin' : '',
      complaint: o ? 'Crooked teeth' : pick(COMPL), cat: o ? 'o' : 'g', sig: true, forOther: o && i < 15 ? { name: 'Parent', rel: 'Mother' } : null, verified: true };
  });
  const cases = [], visits = [], payments = [], appointments = [], charts = {};
  const C = (pid, cat, title, items, sittings, opened, status = 'open') => {
    const c = { id: 'c' + uid(), pid, cat, title, status, opened, sittings, items: items.map(([n, teeth]) => { const s = sv(n); return { id: uid(), name: n, svcId: s.id, teeth: teeth || [], price: s.price, done: false }; }) };
    cases.push(c); return c;
  };
  const f2 = (x) => String(x).padStart(2, '0'), hm = (m) => f2(Math.floor(m / 60)) + ':' + f2(m % 60);
  const V = (c, date, doneIdx, paid, mode, next, reason, fu, rx = '', notes = '') => {
    const its = doneIdx.map((i) => c.items[i]);
    its.forEach((x) => { x.done = true; x.doneDate = date; const s = sv(x.name); if (s && s.marks) x.teeth.forEach((n) => { (charts[c.pid] = charts[c.pid] || {})[n] = s.marks; }); });
    const v = { id: 'v' + uid(), pid: c.pid, caseId: c.id, date, services: its.map((x) => ({ name: x.name, teeth: x.teeth, price: x.price })), notes: notes || its.map((x) => sv(x.name)?.note).filter(Boolean).join(' '), rx, total: sum(its, (x) => x.price), handled: DOCTOR, nextVisit: next || null, nextReason: reason || '', fu: next ? fu || 'pending' : null, stage: 'closed' };
    const h = 10 + Math.floor(rnd() * 9), m = Math.floor(rnd() * 4) * 15, dur = 10 + Math.floor(rnd() * 5) * 7;
    v.inTime = hm(h * 60 + m); v.outTime = hm(h * 60 + m + dur); v.remarks = '';
    visits.push(v);
    if (paid) payments.push({ id: uid(), pid: c.pid, visitId: v.id, date, amount: paid, mode: mode || 'UPI' });
    return v;
  };
  const A = (pid, date, time, reason, status = 'booked') => appointments.push({ id: 'a' + uid(), pid, date, time, reason, status });
  // ortho patients: package + monthly adjustments
  ORTHO.forEach((i, n) => {
    const pid = 'p' + (i + 1), months = [9, 6, 11, 3, 2, 7, 4][n], pkg = ['Metal braces package', 'Ceramic braces package', 'Metal braces package', 'Self-ligating braces package', 'Metal braces package', 'Metal braces package', 'Clear aligners package'][n];
    const items = [['Ortho consultation'], ['Ortho records (photos, models, ceph)'], [pkg]];
    for (let m = 1; m <= months + 1; m++) items.push(['Monthly adjustment']);
    const c = C(pid, 'o', pkg.replace(' package', ''), items, items.length, d(-months * 30 - 10)); c.ortho = true;
    V(c, d(-months * 30 - 10), [0, 1], 1800, 'Cash');
    const inst = Math.round(sv(pkg).price / (months + 6) / 500) * 500;
    V(c, d(-months * 30), [2], inst * 2, 'UPI');
    for (let m = 1; m < months; m++) V(c, d(-(months - m) * 30), [2 + m], inst, 'UPI');
    const nv = [d(-4), d(3), d(2), d(9), d(-1), d(6), d(1)][n], last = visits[visits.length - 1];
    last.nextVisit = nv; last.nextReason = 'Monthly adjustment'; last.fu = n % 2 ? 'booked' : 'pending';
    if (last.fu === 'booked') A(pid, nv < t ? t : nv, ['16:00', '17:30', '18:30', '11:00'][n % 4], 'Monthly adjustment');
  });
  // general cases
  const GP = [['RCT – molar', 'PFM crown', ['36', '46', '16', '26']], ['Composite filling', null, ['14', '24', '25', '15', '35']], ['Extraction', null, ['38', '48', '18']], ['Scaling & polishing', null, []], ['RCT – anterior', 'PFM crown', ['11', '21']], ['Surgical / impaction extraction', 'Review', ['48', '38']], ['Removable partial denture', null, []], ['Implant', 'Zirconia crown', ['46', '36']]];
  patients.filter((p) => p.cat === 'g').forEach((p, i) => {
    const [a, b, teeth] = GP[i % GP.length], tooth = teeth.length ? [pick(teeth)] : [], start = -(10 + Math.floor(rnd() * 100));
    const items = [['Consultation'], ['IOPA X-ray', tooth], [a, tooth]]; if (b) items.push([b, tooth]);
    const open = i % 3 !== 0 && b, c = C(p.id, 'g', a.replace(' – ', ' ') + (tooth.length ? ' – ' + tooth[0] : ''), items, b ? 3 : 2, d(start));
    const price = sum(c.items, (x) => x.price), short = i % 4 === 1 ? Math.min(1500, Math.round((price * 0.2) / 100) * 100) : 0;
    V(c, d(start), [0, 1], c.items[0].price + c.items[1].price, pick(['Cash', 'UPI', 'UPI', 'Card']), null, '', null, i % 2 ? RX[1] : '');
    V(c, d(start + 7), [2], c.items[2].price - short, pick(['Cash', 'UPI', 'Card']), open ? d(start + 21 > -1 ? [2, 5, -2, 0][i % 4] : start + 21) : a === 'Scaling & polishing' ? d(start + 180) : null, open ? b : 'Six-month check-up', null, i % 2 ? RX[0] + '\n' + RX[1] : '');
    if (!open && b) { V(c, d(start + 20), [3], c.items[3].price, 'UPI'); c.status = 'closed'; }
    if (!b) c.status = 'closed';
    if (i % 5 === 2) (charts[p.id] = charts[p.id] || {})[pick(['17', '27', '44', '34'])] = 'decay';
  });
  // follow-up states
  visits.filter((v) => v.fu === 'pending' && v.nextVisit > t).forEach((v, j) => { if (j % 2 === 0) { v.fu = 'booked'; A(v.pid, v.nextVisit, ['10:30', '11:00', '16:30', '18:00', '19:00'][j % 5], v.nextReason); } });
  visits.filter((v) => v.fu === 'pending' && v.nextVisit < t).forEach((v, j) => { if (j % 3 === 1) { v.fu = 'contacted'; const c = addDays(v.nextVisit, 1); v.calledOn = c < t ? c : t; } });
  // today
  const q = [];
  const Q = (pid, time, source, status, extra = {}) => { const x = { id: 'q' + uid(), date: t, token: q.length + 1, pid, time, source, status, ...extra }; q.push(x); return x; };
  // 1 done: seen + paid
  const cDone = C('p16', 'g', 'Extraction – 48', [['Extraction', ['48']]], 1, t); V(cDone, t, [0], 800, 'Cash', d(7), 'Review', null, RX[2]); cDone.status = 'closed';
  Q('p16', '09:30', 'Walk-in', 'done');
  // 2 at checkout
  const c17 = C('p17', 'g', 'Composite filling – 26', [['Composite filling', ['26']], ['Composite filling', ['27']]], 2, t);
  const v17 = V(c17, t, [0], 0, '', d(7), 'Composite filling 27', 'pending', '', 'Caries on 26, composite restoration done. 27 next visit.');
  Object.assign(v17, { stage: 'checkout', suggest: '7', nextVisit: null, fu: null });
  Q('p17', '09:45', 'Walk-in', 'checkout', { visitId: v17.id });
  const c3 = cases.find((c) => c.pid === 'p4'), i3 = c3.items.findIndex((x) => !x.done);
  const v3 = V(c3, t, [i3], 0, '', '', '', null, '', 'Wire changed, elastics advised.');
  Object.assign(v3, { stage: 'checkout', suggest: '30', nextReason: 'Monthly adjustment' });
  Q('p4', '10:00', 'Appointment', 'checkout', { visitId: v3.id });
  A('p4', t, '10:00', 'Monthly adjustment', 'visited');
  Object.assign(patients[0], { complaint: 'Sensitivity, upper left', med: ['Blood Pressure'], allergy: 'Penicillin' });
  // in chair
  Q('p1', '10:10', 'Walk-in', 'in');
  // waiting
  patients.push({ id: 'pnew', reg: 6001 + NAMES.length, created: t, title: 'Mrs.', name: 'Saranya Devi', sex: 'F', age: 33, dob: '', mobile: '9884561200', address: '7, Lake View Road, Selaiyur, Chennai', emerg: '9840011223 · Husband', email: '', prof: 'Teacher', office: '', ref: 'Friend', phys: '', physPh: '', med: ['Hormonal Problems'], other: '', preg: false, nurse: false, allergy: '', complaint: 'Pain in lower right back tooth', cat: 'g', sig: true, forOther: null, verified: false });
  Q('pnew', '10:25', 'QR', 'waiting'); Q('p2', '10:40', 'Appointment', 'waiting'); A('p2', t, '10:30', 'Monthly adjustment', 'checked-in');
  Q('p12', '10:55', 'Walk-in', 'waiting');
  q.forEach((x) => { if (x.status !== 'waiting') { const m = +x.time.slice(0, 2) * 60 + +x.time.slice(3) + 8; x.inTime = hm(m); if (x.status !== 'in') x.outTime = hm(m + 22); } });
  visits.filter((v) => v.date === t).forEach((v) => { const x = q.find((y) => y.pid === v.pid); if (x) { v.inTime = x.inTime; v.outTime = x.outTime; } });
  // still to arrive
  A('p9', t, '12:00', 'Scaling'); A('p20', t, '17:00', 'RCT sitting 2'); A('p24', t, '18:30', 'Review'); A('p28', d(1), '10:00', 'Crown fitting'); A('p31', d(1), '17:30', 'Extraction');
  // Lakshmi's plan for today, in the chair
  C('p1', 'g', 'Sensitivity – 25', [['Consultation'], ['Composite filling', ['25']]], 1, t);
  const expenses = [], m0 = t.slice(0, 8) + '01', inMonth = (n) => (d(n) < m0 ? m0 : d(n));
  const E = (date, category, item, amount, vendor = '') => expenses.push({ id: uid(), date, category, item, amount, vendor });
  E(m0, 'Rent', 'Clinic rent', 22000, 'Owner'); E(m0, 'Salary', 'Receptionist salary', 12000); E(m0, 'Salary', 'Assistant salary', 9000); E(inMonth(-6), 'Lab', 'Crown lab work, 2 units', 4200, 'Precision Dental Lab'); E(inMonth(-3), 'Consumables', 'Composite kit and gloves', 3800, 'Sri Dental Supplies'); E(inMonth(-2), 'Utilities', 'EB bill', 3900, 'TNEB');
  const inventory = [], invLog = [];
  const I = (name, cat, unit, min, batches) => {
    const it = { id: 'i' + uid(), name, cat, unit, min, batches: batches.map(([qty, exp, cost, ago, vendor]) => ({ id: uid(), qty, expiry: exp === null ? '' : d(exp), cost, date: d(-ago), vendor: vendor || 'Sri Dental Supplies' })) };
    inventory.push(it); it.batches.forEach((b) => invLog.push({ id: uid(), date: b.date, itemId: it.id, type: 'in', qty: b.qty, note: 'Purchase · ' + b.vendor }));
  };
  I('Lignocaine 2% with adrenaline', 'Anaesthetic', 'cartridge', 20, [[46, 240, 1450, 20]]);
  I('Composite resin A2 syringe', 'Restorative', 'syringe', 3, [[2, 400, 3200, 35]]);
  I('GIC restorative (powder + liquid)', 'Restorative', 'kit', 1, [[2, 22, 1900, 60]]);
  I('Etchant gel 37%', 'Restorative', 'syringe', 2, [[3, -5, 600, 200]]);
  I('Examination gloves (M)', 'Disposables', 'box of 100', 4, [[9, 500, 2700, 12]]);
  I('Face masks 3-ply', 'Disposables', 'box of 50', 3, [[2, 700, 500, 30]]);
  I('K-files 21 mm assorted', 'Endodontic', 'pack', 2, [[5, null, 1750, 40]]);
  I('Gutta-percha points', 'Endodontic', 'box', 2, [[4, 600, 1200, 40]]);
  I('Alginate impression material', 'Restorative', 'pack (450 g)', 2, [[1, 75, 900, 50]]);
  I('Metal brackets MBT 0.022', 'Orthodontic', 'kit', 3, [[6, null, 7200, 45, 'Ortho Mart']]);
  I('NiTi archwires 0.014', 'Orthodontic', 'pack of 10', 2, [[3, null, 1800, 45, 'Ortho Mart']]);
  I('Elastomeric ligatures', 'Orthodontic', 'pack', 2, [[1, 365, 400, 45, 'Ortho Mart']]);
  I('Chlorhexidine mouthwash 0.2%', 'Medicines', 'bottle', 5, [[12, 300, 960, 15]]);
  invLog.push({ id: uid(), date: d(-1), itemId: inventory[0].id, type: 'out', qty: 4, note: 'Used in treatment' });
  const approvals = [{ id: uid(), svcId: sv('Scaling & polishing').id, name: 'Scaling & polishing', old: 1200, price: 1500, pid: 'p9', date: d(-1), status: 'pending' }];
  const clinic = { name: 'Pari Dental Hospital', addr: 'No. 10, Municipal Building, Kamarajapuram, Chennai - 600 073', phone: '86 87 88 89 34', email: 'drnarasimman@hotmail.com', sig: null,
    template: 'Hello {name}, this is a reminder from {clinic} for your dental visit ({reason}) on {date}. Please call {phone} to confirm. Thank you.' };
  const db = { seededOn: t, clinic, services, patients, cases, visits, payments, appointments, queue: q, charts, expenses, approvals, inventory, invLog, reports: [],
    staff: [{ id: 'st1', name: DOCTOR, role: 'Doctor', phone: clinic.phone, active: true, since: '2010-01-01' }], notes: { dismissed: {}, snooze: {} }, nextReg: 6001 + NAMES.length + 1 };
  // one sample report
  const rp = patients.find((x) => visits.some((v) => v.pid === x.id && v.services.some((s) => /Extraction/.test(s.name))));
  if (rp) db.reports.push({ id: uid(), pid: rp.id, date: d(-3), ...repDefaults(db, rp), sigMode: 'none', sig: null });
  return db;
}
