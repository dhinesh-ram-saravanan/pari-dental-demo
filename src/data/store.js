// The whole app state lives in localStorage under one key, so two tabs
// (reception on one screen, doctor on another) stay in sync via the `storage` event.
import { useSyncExternalStore } from 'react';
import { seed } from './seed.js';
import { today } from '../logic/format.js';

export const KEY = 'pariDental.v1';
const subs = new Set();
let ver = 0;
const emit = () => { ver++; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

let full = false; // the last save did not fit in browser storage
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); full = false; } catch { full = true; } };
const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s?.patients && s.queue ? s : null; } catch { return null; } };
function load() {
  const s = read();
  // The sample day is built around "today". An untouched copy from an earlier day is re-seeded;
  // once anyone has entered something, the data is kept until "Reset demo data".
  return s && (s.seededOn === today() || s.touched) ? s : null;
}
let db = load();
if (!db) { db = seed(); save(); }

window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { db = JSON.parse(e.newValue); emit(); } catch { /* ignore a half-written value */ }
});

export const getDb = () => db;
export function update(fn) {
  db = read() || db; // take the other tab's latest writes first, so nothing is overwritten
  const r = fn(db);
  db.touched = true;
  save(); emit();
  if (full) toast('Not saved: this browser’s storage is full. Remove large signatures or old reports.');
  return r;
}
// A tab left open overnight repaints when someone comes back to it.
document.addEventListener('visibilitychange', emit);
export function resetDb() { db = seed(); save(); emit(); }
export function useDb() { useSyncExternalStore(subscribe, () => ver); return db; }

// Per-tab UI state (role, open sheets, the doctor's unsaved consultation).
const ROLE = 'pariDental.role';
const fromHash = /^#\/(doctor|overview|clinic)/.test(location.hash) ? 'doctor' : 'reception';
// The doctor's unsaved consultation and reception's checkout drafts survive a reload of the tab.
const DRAFTS = 'pariDental.drafts';
const kept = (() => { try { return JSON.parse(sessionStorage.getItem(DRAFTS)) || {}; } catch { return {}; } })();
const ui = { role: sessionStorage.getItem(ROLE) || fromHash, toast: '', doc: kept.doc || null, co: null, coDrafts: kept.coDrafts || {}, book: null, qr: false, print: null, treg: {}, calDay: null, peek: null, pOpen: false, regPrefill: null, repPid: null };
export function setUi(patch) {
  Object.assign(ui, patch);
  if (patch.role) sessionStorage.setItem(ROLE, patch.role);
  if ('doc' in patch || 'coDrafts' in patch) sessionStorage.setItem(DRAFTS, JSON.stringify({ doc: ui.doc, coDrafts: ui.coDrafts }));
  emit();
}
export function useUi() { useSyncExternalStore(subscribe, () => ver); return ui; }

let timer;
// longer messages stay on screen longer
export function toast(msg) { clearTimeout(timer); setUi({ toast: msg }); timer = setTimeout(() => setUi({ toast: '' }), Math.max(3200, msg.length * 70)); }
// Run an action against the db and toast its message. Returns the action's result.
export function run(fn) { const r = update(fn); if (r?.msg) toast(r.msg); return r; }

export function go(path) { location.hash = '#' + path; window.scrollTo(0, 0); }
export function useRoute() {
  return useSyncExternalStore(
    (f) => { window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); },
    () => location.hash.replace(/^#/, '') || '/',
  );
}
