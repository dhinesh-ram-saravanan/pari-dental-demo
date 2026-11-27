// Getting a form from the patient's own phone to the desk without a server:
// the answers travel inside a link the patient sends to the clinic on WhatsApp.
import { emptyP, validateReg } from './validation.js';

const TEXT = ['title', 'name', 'sex', 'age', 'dob', 'dobD', 'dobM', 'dobY', 'address', 'mobile', 'emergNo', 'emergRel', 'email', 'prof', 'office', 'ref', 'phys', 'physPh', 'other', 'allergy', 'complaint', 'oName', 'oRel', 'typedSig'];
const FLAGS = ['preg', 'nurse', 'forOther'];

export function packForm(r) {
  const o = { med: r.med, signed: !!r.sig };
  TEXT.forEach((k) => { if (r[k]) o[k] = r[k]; });
  FLAGS.forEach((k) => { if (r[k]) o[k] = 1; });
  return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// → { form } or { error }. The link comes from outside, so only known fields are kept and the form is validated again.
export function unpackForm(code, medList) {
  let o;
  try { o = JSON.parse(decodeURIComponent(escape(atob(String(code).replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return { error: 'This link is damaged. Ask the patient to send it again.' }; }
  if (!o || typeof o !== 'object') return { error: 'This link is damaged. Ask the patient to send it again.' };
  const r = emptyP();
  TEXT.forEach((k) => { if (typeof o[k] === 'string' || typeof o[k] === 'number') r[k] = String(o[k]).slice(0, 200); });
  FLAGS.forEach((k) => { r[k] = !!o[k]; });
  r.med = Array.isArray(o.med) ? o.med.filter((m) => medList.includes(m)) : [];
  r.consent = true; r.paperSig = !!o.signed; // signed on the patient's phone; the drawing itself is too large for a link
  const bad = Object.values(validateReg(r));
  return bad.length ? { error: 'This form is incomplete: ' + bad[0] } : { form: r };
}
