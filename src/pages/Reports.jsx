import { useState } from 'react';
import SignaturePad from '../components/SignaturePad.jsx';
import { SortHeader, Segmented, Switch } from '../components/controls.jsx';
import { Head } from '../components/PatientBits.jsx';
import { ReportDoc } from '../components/Prints.jsx';
import { useDb, getDb, useUi, update, setUi, toast, go } from '../data/store.js';
import { P } from '../data/selectors.js';
import { repDefaults } from '../logic/report.js';
import { today, fmtD, inr, sum, uid, sortBy } from '../logic/format.js';

const total = (r) => sum(r.lines, (l) => l.amount);
const printReport = (db, r) => setUi({ print: <div className="rpage"><ReportDoc db={db} r={r} /></div> });

export function Reports() {
  const db = useDb();
  const [sort, setSort] = useState({ k: 'date', dir: -1 });
  const list = sortBy(db.reports.filter((r) => P(db, r.pid)), sort, { date: (r) => r.date, name: (r) => P(db, r.pid).name.toLowerCase(), total });
  const del = (r) => { if (window.confirm(`Delete the report for ${P(db, r.pid).name}?`)) { update((d) => { d.reports = d.reports.filter((x) => x.id !== r.id); }); toast('Report deleted'); } };
  return (
    <>
      <Head title="Dental treatment reports" sub="Letters for patients, insurance or employers, in the clinic’s format"><button type="button" className="btn primary" onClick={() => go('/reports/new')}>+ New report</button></Head>
      <div className="list">
        <div className="li hd rep"><SortHeader sort={sort} setSort={setSort} k="date" label="Date" /><SortHeader sort={sort} setSort={setSort} k="name" label="Patient" /><SortHeader sort={sort} setSort={setSort} k="total" label="Total" /><span /></div>
        {list.map((r) => { const p = P(db, r.pid); return (
          <div className="li rep" key={r.id}>
            <div className="sm">{fmtD(r.date)}</div><div><b>{p.name}</b><div className="what">Reg. {p.reg}{r.sig ? ' · signed' : ' · not signed'}</div></div><div>{inr(total(r))}</div>
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn sm ghost" onClick={() => go('/reports/' + r.id)}>Open</button><button type="button" className="btn sm" onClick={() => printReport(db, r)}>Print</button><button type="button" className="icon" aria-label={`Delete report for ${p.name}`} onClick={() => del(r)}>×</button></div>
          </div>
        ); })}
        {!list.length && <div className="empty"><p>No reports yet. Create one from a patient’s treatment.</p></div>}
      </div>
    </>
  );
}

// Editor with a live A4 preview. Auto-filled from the record; every word is editable.
export function ReportEdit({ id }) {
  const db = useDb(), pre = useUi().repPid;
  const [r, setR] = useState(() => {
    const d = getDb(), ex = d.reports.find((x) => x.id === id);
    if (ex) return structuredClone(ex);
    const p0 = pre && P(d, pre); // started from a patient's record: already filled in
    return { pid: p0 ? p0.id : '', date: today(), body: '', lines: [], ...(p0 ? repDefaults(d, p0) : {}), sigMode: d.clinic.sig ? 'saved' : 'draw', sig: d.clinic.sig || null };
  });
  const [dirty, setDirty] = useState(false);
  const refill = (p1) => { if (dirty && !window.confirm('Replace the text and costs you have edited with a fresh draft from the record?')) return; setDirty(false); set({ pid: p1.id, ...repDefaults(db, p1) }); };
  const [padKey, setPadKey] = useState(0);
  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const p = r.pid && P(db, r.pid), pts = [...db.patients].sort((a, b) => a.name.localeCompare(b.name));
  const setLine = (i, patch) => set({ lines: r.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const save = (print) => {
    if (!r.pid || !p) return toast('Choose a patient');
    const gap = r.body.match(/\[[^\]]+\]/);
    if (gap && !window.confirm(`The letter still says ${gap[0]}. Save it like this?`)) return;
    setUi({ repPid: null });
    const saved = { ...r, id: r.id || uid() };
    update((d) => { const i = d.reports.findIndex((x) => x.id === saved.id); if (i >= 0) d.reports[i] = saved; else d.reports.push(saved); });
    toast('Report saved'); go('/reports');
    if (print) printReport(db, saved);
  };
  const saveDefault = () => { if (!r.sig) return toast('Draw or upload a signature first'); update((d) => { d.clinic.sig = r.sig; }); toast('Saved as the doctor’s signature'); };
  // switching between Draw / Upload / Saved keeps what was drawn or uploaded
  const setMode = (v) => set({ sigMode: v, own: v === 'saved' || v === 'none' ? (r.sigMode === 'draw' || r.sigMode === 'upload' ? r.sig : r.own) : r.own, sig: v === 'saved' ? db.clinic.sig || null : v === 'none' ? null : (r.sigMode === 'draw' || r.sigMode === 'upload' ? r.sig : r.own || null) });
  const upload = (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 150000) { e.target.value = ''; return toast('That image is too large. Choose one under 150 KB.'); } const rd = new FileReader(); rd.onload = () => set({ sig: rd.result }); rd.readAsDataURL(f); };
  return (
    <>
      <Head title={r.id ? 'Edit report' : 'New report'}><button type="button" className="btn ghost" onClick={() => go('/reports')}>Cancel</button><button type="button" className="btn" onClick={() => save(false)}>Save</button><button type="button" className="btn primary" onClick={() => save(true)}>Save and print</button></Head>
      <div className="split repsplit">
        <div className="left" style={{ position: 'static', maxHeight: 'none' }}>
          <label>Patient<select value={r.pid} onChange={(e) => (e.target.value ? refill(P(db, e.target.value)) : set({ pid: '' }))}><option value="">Choose a patient</option>{pts.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.reg}</option>)}</select></label>
          {p ? (
            <>
              <label>Date<input type="date" value={r.date} onChange={(e) => set({ date: e.target.value || today() })} /></label>
              <label>Report text<textarea rows="9" value={r.body} onChange={(e) => { setDirty(true); set({ body: e.target.value }); }} /></label>
              {/\[[^\]]+\]/.test(r.body) && <p className="warnline">Fill in the part in [square brackets] before printing.</p>}
              <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => refill(p)}>Rewrite from record</button>
              <div className="lbl" style={{ marginTop: 14 }}>Cost of the treatment</div>
              {r.lines.map((l, i) => (
                <div className="row-actions" style={{ marginBottom: 6 }} key={i}>
                  <input value={l.name} style={{ flex: 1 }} aria-label={`Item ${i + 1}`} onChange={(e) => { setDirty(true); setLine(i, { name: e.target.value }); }} />
                  <input type="number" min="0" value={l.amount} style={{ width: 100 }} aria-label={`Amount ${i + 1}`} onChange={(e) => setLine(i, { amount: +e.target.value || 0 })} />
                  <button type="button" className="icon" aria-label={`Remove item ${i + 1}`} onClick={() => set({ lines: r.lines.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
              <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ lines: [...r.lines, { name: '', amount: 0 }] })}>+ Add line</button>
              <p className="sm" style={{ margin: '8px 0 0' }}>Total <b>{inr(total(r))}</b></p>
              <div className="row-actions" style={{ marginTop: 16 }}><Switch on={!!r.letterhead} label="Print the clinic letterhead" onChange={(v) => set({ letterhead: v })} /><span className="sm">Print the clinic name and address at the top <span className="muted">(off for pre-printed paper)</span></span></div>
              <div className="lbl" style={{ marginTop: 16 }}>Digital signature</div>
              <div style={{ marginBottom: 8 }}><Segmented label="Signature" value={r.sigMode} options={[...(db.clinic.sig ? [['saved', 'Saved signature']] : []), ['draw', 'Draw'], ['upload', 'Upload image'], ['none', 'None']]} onChange={setMode} /></div>
              {r.sigMode === 'draw' && <>
                <div className="sigbox"><SignaturePad key={padKey} ink="#1b2a6b" initial={r.sig} onChange={(d) => set({ sig: d })} /></div>
                <div className="row-actions" style={{ marginTop: 6 }}><button type="button" className="btn sm ghost" onClick={() => { set({ sig: null }); setPadKey(padKey + 1); }}>Clear</button><button type="button" className="btn sm" onClick={saveDefault}>Save as the doctor’s signature</button></div>
              </>}
              {r.sigMode === 'upload' && <>
                <input type="file" accept="image/*" aria-label="Signature image" onChange={upload} />
                <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={saveDefault}>Save as the doctor’s signature</button>
              </>}
            </>
          ) : <p className="sm muted">Choose a patient. The report fills in from their record, and you can edit every word.</p>}
        </div>
        <div>{p && <div className="preview" data-testid="report-preview"><ReportDoc db={db} r={r} /></div>}</div>
      </div>
    </>
  );
}
