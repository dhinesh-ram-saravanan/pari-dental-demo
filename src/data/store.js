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

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked: keep working in memory */ } };
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    // The sample day is built around "today", so a copy from an earlier day is re-seeded.
    if (s && s.seededOn === today()) return s;
  } catch { /* fall through to a fresh seed */ }
  return null;
}
let db = load();
if (!db) { db = seed(); save(); }

window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { db = JSON.parse(e.newValue); emit(); } catch { /* ignore a half-written value */ }
});

export const getDb = () => db;
export function update(fn) { const r = fn(db); save(); emit(); return r; }
export function resetDb() { db = seed(); save(); emit(); }
export function useDb() { useSyncExternalStore(subscribe, () => ver); return db; }

// Per-tab UI state (role, open sheets, the doctor's unsaved consultation).
const ROLE = 'pariDental.role';
const fromHash = /^#\/(doctor|overview|clinic)/.test(location.hash) ? 'doctor' : 'reception';
const ui = { role: sessionStorage.getItem(ROLE) || fromHash, toast: '', doc: null, co: null, book: null, qr: false, print: null, treg: {}, calDay: null };
export function setUi(patch) {
  Object.assign(ui, typeof patch === 'function' ? patch(ui) : patch);
  if (patch.role) sessionStorage.setItem(ROLE, patch.role);
  emit();
}
export function useUi() { useSyncExternalStore(subscribe, () => ver); return ui; }

let timer;
export function toast(msg) { clearTimeout(timer); setUi({ toast: msg }); timer = setTimeout(() => setUi({ toast: '' }), 3200); }
// Run an action against the db and toast its message. Returns the action's result.
export function run(fn) { const r = update(fn); if (r?.msg) toast(r.msg); return r; }

export function go(path) { location.hash = '#' + path; window.scrollTo(0, 0); }
export function useRoute() {
  return useSyncExternalStore(
    (f) => { window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); },
    () => location.hash.replace(/^#/, '') || '/',
  );
}
