import { today, addDays, sum, uid } from './format.js';

export const invQty = (i) => sum(i.batches, (b) => b.qty);
export const nearExp = (i) => i.batches.filter((b) => b.qty > 0 && b.expiry).map((b) => b.expiry).sort()[0] || '';
// → [tone, label]
export function invStatus(i) {
  const q = invQty(i), e = nearExp(i), t = today();
  if (e && e < t) return ['bad', 'Expired'];
  if (q === 0) return ['bad', 'Out of stock'];
  if (q <= i.min) return ['pay', 'Low stock'];
  if (e && e <= addDays(t, 30)) return ['late', 'Expires soon'];
  return ['done', 'OK'];
}
export const invAlerts = (db) => (db.inventory || []).filter((i) => invStatus(i)[1] !== 'OK');

// Takes stock from the earliest expiry first. Returns { ok, low } or { ok:false, msg }.
export function useStock(db, itemId, qty, note) {
  const it = db.inventory.find((i) => i.id === itemId);
  let q = +qty;
  if (!(Number.isInteger(q) && q > 0)) return { ok: false, msg: 'Quantity must be a whole number above 0' };
  if (q > invQty(it)) return { ok: false, msg: `Only ${invQty(it)} in stock` };
  [...it.batches].filter((b) => b.qty > 0).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'))
    .forEach((b) => { const k = Math.min(b.qty, q); b.qty -= k; q -= k; });
  db.invLog.push({ id: uid(), date: today(), itemId, type: 'out', qty: +qty, note: note || 'Used' });
  return { ok: true, item: it, low: invQty(it) <= it.min };
}

// Adds a purchase batch and books its cost as an expense.
export function stockIn(db, f) {
  let it = db.inventory.find((i) => i.id === f.itemId);
  if (!it) { it = { id: 'i' + uid(), name: f.name.trim(), cat: f.cat, unit: (f.unit || '').trim() || 'unit', min: 0, batches: [] }; db.inventory.push(it); }
  const qty = +f.qty, cost = +f.cost, date = f.date || today(), vendor = (f.vendor || '').trim();
  it.min = +f.min || 0;
  it.batches.push({ id: uid(), qty, expiry: f.expiry || '', cost, date, vendor });
  db.invLog.push({ id: uid(), date, itemId: it.id, type: 'in', qty, note: 'Purchase' + (vendor ? ' · ' + vendor : '') });
  if (cost > 0) db.expenses.push({ id: uid(), date, category: it.cat === 'Instruments' ? 'Equipment' : 'Consumables', item: `${it.name} × ${qty}`, amount: cost, vendor });
  return it;
}
