import { today, dmy, uid } from './format.js';
import { ageOf } from './age.js';
import { emptyP, MOBILE } from './validation.js';

// Excel serials, dd/mm/yyyy and yyyy-mm-dd → 'YYYY-MM-DD' ('' when unreadable).
export function xlDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toLocaleDateString('en-CA');
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  const real = (y, mo, d) => { const x = new Date(y, mo - 1, d); return x.getFullYear() === y && x.getMonth() === mo - 1 && x.getDate() === d ? x.toLocaleDateString('en-CA') : ''; };
  if (m) { let y = +m[3]; if (y < 100) y += y > 30 ? 1900 : 2000; return real(y, +m[2], +m[1]); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? real(+m[1], +m[2], +m[3]) : '';
}

// Sheet columns: A Reg No. · B Date · C Name · D Treatment · E Mobile · F Address · G Age · H Sex · I–K ignored · L DOB.
// `existing` is the current patients ([{ reg, name }]); plain Reg Nos are accepted too.
export function parseSheet(rows, existing = []) {
  const out = [], seen = new Set();
  const known = new Map(existing.map((p) => (typeof p === 'object' ? [p.reg, p.name] : [p, null])));
  rows.forEach((r, i) => {
    if (!r || r.every((c) => c === '' || c == null)) return;
    const reg = String(r[0] ?? '').trim();
    if (i === 0 && !/^\d+$/.test(reg)) return; // header row
    const issues = [], warn = [], name = String(r[2] ?? '').trim().replace(/\s+/g, ' ');
    if (!/^\d+$/.test(reg)) issues.push(reg ? 'Reg No. is not a number' : 'Reg No. is missing');
    else if (+reg < 1 || +reg > 9999999) issues.push('Reg No. is out of range');
    else if (seen.has(+reg)) issues.push(`Reg No. ${+reg} appears twice in this file`);
    else seen.add(+reg);
    if (!name) issues.push('Name is empty');
    const owner = known.get(+reg);
    if (name && owner && owner.toLowerCase() !== name.toLowerCase()) issues.push(`Reg No. ${+reg} already belongs to ${owner}`);
    let mob = String(r[4] ?? '').replace(/\D/g, ''), land = '';
    if (mob.length === 12 && mob.startsWith('91')) mob = mob.slice(2);
    if (mob && !MOBILE.test(mob)) {
      if (/^0\d{9,10}$/.test(mob)) { land = mob; warn.push(`“${r[4]}” is a landline, saved as office phone`); } else warn.push(`Mobile “${r[4]}” is not 10 digits, left blank`);
      mob = '';
    }
    const date = xlDate(r[1]); if (r[1] && !date) warn.push('Date not understood');
    const dob = xlDate(r[11]); if (r[11] && !dob) warn.push('DOB not understood, left blank');
    const sx = String(r[7] ?? '').trim().toUpperCase()[0], sex = sx === 'M' || sx === 'F' ? sx : '';
    if (r[7] && !sex) warn.push('Sex not understood');
    const age = parseInt(r[6]);
    out.push({ line: i + 1, reg: /^\d+$/.test(reg) ? +reg : 0, date, name, treat: String(r[3] ?? '').trim(), mobile: mob, land, address: String(r[5] ?? '').trim(), age: isNaN(age) ? '' : age, sex, dob, issues, warn, exists: known.has(+reg) });
  });
  return out;
}

export function importCounts(rows) {
  const ok = rows.filter((r) => !r.issues.length);
  const fresh = ok.filter((r) => !r.exists).length;
  return { total: rows.length, ok: ok.length, fresh, update: ok.length - fresh, skipped: rows.length - ok.length, notes: ok.filter((r) => r.warn.length).length };
}

// Creates patients (plus a legacy visit for the treatment) and bumps the next Reg No.
export function applyImport(db, rows) {
  let fresh = 0, updated = 0;
  const byReg = new Map(db.patients.map((p) => [p.reg, p]));
  rows.filter((r) => !r.issues.length).forEach((r) => {
    let p = byReg.get(r.reg);
    const data = { name: r.name, mobile: r.mobile || p?.mobile || '', office: r.land || p?.office || '', address: r.address, age: r.age === '' ? null : r.age, sex: r.sex, dob: r.dob, legacyTreatment: r.treat };
    if (p) { Object.assign(p, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v != null))); updated++; return; }
    p = { ...emptyP(), id: 'p' + uid(), reg: r.reg, created: r.date || today(), title: r.sex === 'F' ? 'Ms.' : 'Mr.', ...data, emerg: '', cat: 'g', sig: false, verified: true, imported: true, forOther: null };
    db.patients.push(p); byReg.set(p.reg, p); fresh++;
    if (r.treat) db.visits.push({ id: 'v' + uid(), pid: p.id, caseId: null, date: r.date || today(), services: [{ name: r.treat, teeth: [], price: 0 }], notes: '', rx: '', total: 0, handled: '', nextVisit: null, nextReason: '', fu: null, stage: 'closed', legacy: true, inTime: '', outTime: '', remarks: 'Imported from Excel' });
  });
  const mx = db.patients.reduce((m, p) => Math.max(m, p.reg), 0);
  if (mx >= db.nextReg) db.nextReg = mx + 1;
  return { fresh, updated };
}

export const lastTreatment = (db, p) => {
  const v = db.visits.filter((x) => x.pid === p.id && x.services.length).sort((a, b) => b.date.localeCompare(a.date))[0];
  return v ? v.services.map((s) => s.name + (s.teeth?.length ? ' ' + s.teeth.join(',') : '')).join(', ') : p.legacyTreatment || '';
};

// Same columns as the clinic's sheet; dates as dd/mm/yyyy.
export const exportRows = (db) => [...db.patients].sort((a, b) => a.reg - b.reg).map((p) => ({
  'Reg No.': p.reg, Date: p.created ? dmy(p.created) : '', Name: p.name, Treatment: lastTreatment(db, p), 'Mobile Number': p.mobile || '', Address: p.address || '', Age: ageOf(p) ?? '', Sex: p.sex || '', DOB: p.dob ? dmy(p.dob) : '',
}));
