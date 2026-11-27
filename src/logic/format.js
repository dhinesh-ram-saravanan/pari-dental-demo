// Small date, money and list helpers. Dates are 'YYYY-MM-DD' strings in local time.
let n = 0;
export const uid = () => Date.now().toString(36).slice(-4) + (n++).toString(36) + Math.random().toString(36).slice(2, 6);
export const today = () => new Date().toLocaleDateString('en-CA');
export const addDays = (d, k) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + k); return x.toLocaleDateString('en-CA'); };
export const fmtD = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const fmtS = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
export const dmy = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
export const longDay = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
export const inr = (v) => (v < 0 ? '−' : '') + '₹' + Math.abs(Number(v || 0)).toLocaleString('en-IN');
export const nowT = () => new Date().toTimeString().slice(0, 5);
export const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const mins = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const minsAgo = (t) => { if (!t) return 0; const d = new Date(); return Math.max(0, d.getHours() * 60 + d.getMinutes() - mins(t)); };
export const fill = (tpl, o) => tpl.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(o, k) ? o[k] : m));
export const sortBy = (arr, sort, getters) => {
  const g = getters[sort.k] || Object.values(getters)[0];
  return [...arr].sort((a, b) => { const x = g(a), y = g(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
};
const ord = (d) => d + (['th', 'st', 'nd', 'rd'][((d % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][d % 100] || 'th');
export const longDate = (d) => { const x = new Date(d + 'T00:00:00'); return `${ord(x.getDate())} ${x.toLocaleDateString('en-GB', { month: 'long' })} ${x.getFullYear()}`; };
