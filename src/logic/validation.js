import { today, nowT, uid } from './format.js';
import { ageOf } from './age.js';

export const MOBILE = /^[6-9]\d{9}$/;
export const NAME = /^[A-Za-z .']{2,60}$/;
export const DIGIT_FIELDS = { mobile: 10, emergNo: 10, office: 11, physPh: 11, age: 3 };
// Strip everything but digits as the user types.
export const digits = (v, max = 10) => String(v ?? '').replace(/\D/g, '').slice(0, max);

export const emptyP = () => ({ title: 'Mr.', name: '', age: '', sex: '', dob: '', address: '', mobile: '', emergNo: '', emergRel: '', email: '', prof: '', office: '', ref: '', phys: '', physPh: '', med: [], other: '', preg: false, nurse: false, allergy: '', complaint: '', cat: 'g', consent: false, sig: false, forOther: false, oName: '', oRel: '' });

// Returns { field: message } for the registration form; empty object means valid.
export function validateReg(r) {
  const e = {}, t = today();
  if (!r.name.trim()) e.name = 'Enter the full name'; else if (!NAME.test(r.name.trim())) e.name = 'Letters, spaces and dots only';
  if (!r.sex) e.sex = 'Choose one';
  if (r.dob) { if (r.dob > t) e.dob = 'Date of birth cannot be in the future'; else if (ageOf({ dob: r.dob }) > 120) e.dob = 'Check the year'; }
  const noAge = r.age === '' || r.age == null;
  if (!r.dob && noAge) e.age = 'Enter age or date of birth';
  else if (!noAge && !(+r.age >= 0 && +r.age <= 120 && Number.isInteger(+r.age))) e.age = 'Age must be 0 to 120';
  if (!MOBILE.test(r.mobile || '')) e.mobile = r.mobile ? 'Must be 10 digits starting with 6, 7, 8 or 9' : 'Enter the mobile number';
  if (r.emergNo && !MOBILE.test(r.emergNo)) e.emergNo = '10 digits';
  if (r.emergNo && !r.emergRel) e.emergRel = 'Who is this?';
  if (r.office && !/^\d{10,11}$/.test(r.office)) e.office = '10 or 11 digits';
  if (r.physPh && !/^\d{10,11}$/.test(r.physPh)) e.physPh = '10 or 11 digits';
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) e.email = 'Check the email';
  if (!r.address.trim() || r.address.trim().length < 6) e.address = 'Enter the address';
  if (!r.complaint.trim()) e.complaint = 'What brings you in?';
  if (!r.consent) e.consent = 'Please tap “I agree”';
  if (!r.sig && !r.id) e.sig = 'Please sign';
  if (r.forOther) { if (!r.oName.trim()) e.oName = 'Your name'; if (!r.oRel.trim()) e.oRel = 'Relationship'; }
  return e;
}

// Same mobile already used by a patient with a different name (warn once).
export const mobileClash = (db, r) =>
  db.patients.find((p) => p.mobile === r.mobile && p.id !== r.id && p.name.toLowerCase() !== r.name.trim().toLowerCase());

export const allocReg = (db) => db.nextReg++;

// Creates or updates a patient from the form. Returns the patient.
export function savePatient(db, r, { verified = true } = {}) {
  const data = { title: r.title, name: r.name.trim(), sex: r.sex, age: r.age === '' || r.age == null ? null : +r.age, dob: r.dob, address: r.address, mobile: r.mobile, emerg: r.emergNo ? r.emergNo + (r.emergRel ? ' · ' + r.emergRel : '') : '', email: r.email, prof: r.prof, office: r.office, ref: r.ref, phys: r.phys, physPh: r.physPh, med: [...r.med], other: r.other, preg: r.sex === 'F' && r.preg, nurse: r.sex === 'F' && r.nurse, allergy: r.allergy, complaint: r.complaint, cat: r.cat, sig: !!r.sig, sigData: r.sigData || null, forOther: r.forOther ? { name: r.oName, rel: r.oRel } : null };
  if (r.id) { const p = db.patients.find((x) => x.id === r.id); Object.assign(p, data, { verified: true }); return p; }
  const dup = db.patients.find((p) => p.mobile === data.mobile && p.name.toLowerCase() === data.name.toLowerCase());
  if (dup) return dup;
  const p = { id: 'p' + uid(), reg: allocReg(db), created: today(), ...data, verified };
  db.patients.push(p);
  return p;
}

// Form state for editing an existing patient.
export const formFromPatient = (p) => ({ ...emptyP(), ...p, age: p.age ?? '', med: [...(p.med || [])], consent: true, forOther: !!p.forOther, oName: p.forOther?.name || '', oRel: p.forOther?.rel || '', emergNo: digits((p.emerg || '').split('·')[0]), emergRel: ((p.emerg || '').split('·')[1] || '').trim() });

export function validateBooking({ date, time, isNew, newName, newPhone }) {
  const E = {};
  if (!date || date < today()) E.d = 'Choose today or a later date'; else if (date === today() && time <= nowT()) E.d = 'That time has passed';
  if (isNew) { if (!NAME.test((newName || '').trim())) E.n = 'Enter the name'; if (!MOBILE.test(newPhone || '')) E.m = '10 digits, starting 6 to 9'; }
  return E;
}

export function validateStockIn(f) {
  const qty = +f.qty;
  if (!f.itemId && !(f.name || '').trim()) return 'Enter the item name';
  if (!(Number.isInteger(qty) && qty > 0) || f.qty === '') return 'Quantity must be a whole number above 0';
  if (f.cost === '' || !(+f.cost >= 0)) return 'Enter the total cost (0 if free)';
  if (f.expiry && f.expiry < today()) return 'That expiry date has already passed';
  if (f.min === '' || !(+f.min >= 0)) return 'Enter the stock level to be alerted at';
  return '';
}
