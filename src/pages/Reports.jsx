import { useState } from 'react';
import SignaturePad from '../components/SignaturePad.jsx';
import { SortHeader, Segmented } from '../components/controls.jsx';
import { Head } from '../components/PatientBits.jsx';
import { ReportDoc } from '../components/Prints.jsx';
import { useDb, getDb, update, setUi, toast, go } from '../data/store.js';
import { P } from '../data/selectors.js';
import { repDefaults } from '../logic/report.js';
import { today, fmtD, inr, sum, uid, sortBy } from '../logic/format.js';

const total = (r) => sum(r.lines, (l) => l.amount);
const printReport = (db, r) => setUi({ print: <div className="rpage"><ReportDoc db={db} r={r} /></div> });
const GRID = { gridTemplateColumns: '120px minmax(0,1fr) 120px 180px' };

export function Reports() {
  const db = useDb();
  const [sort, setSort] = useState({ k: 'date', dir: -1 });
  const list = sortBy(db.reports, sort, { date: (r) => r.date, name: (r) => P(db, r.pid).name.toLowerCase(), total });
  return (
    <>
      <Head title="Dental treatment reports" sub="Letters for patients, insurance or employers, in the clinic’s format"><button type="button" className="btn primary" onClick={() => go('/reports/new')}>+ New report</button></Head>
      <div className="list">
        <div className="li hd" style={GRID}><SortHeader sort={sort} setSort={setSort} k="date" label="Date" /><SortHeader sort={sort} setSort={setSort} k="name" label="Patient" /><SortHeader sort={sort} setSort={setSort} k="total" label="Total" /><span /></div>
        {list.map((r) => { const p = P(db, r.pid); return (
          <div className="li" style={GRID} key={r.id}>
            <div className="sm">{fmtD(r.date)}</div><div><b>{p.name}</b><div className="what">Reg. {p.reg}{r.sig ? ' · signed' : ' · not signed'}</div></div><div>{inr(total(r))}</div>
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn sm ghost" onClick={() => go('/reports/' + r.id)}>Open</button><button type="button" className="btn sm" onClick={() => printReport(db, r)}>Print</button></div>
          </div>
        ); })}
        {!list.length && <div className="empty"><p>No reports yet. Create one from a patient’s treatment.</p></div>}
      </div>
    </>
  );
}

// Editor with a live A4 preview. Auto-filled from the record; every word is editable.
export function ReportEdit({ id }) {
  const db = useDb();
  const [r, setR] = useState(() => { const d = getDb(), ex = d.reports.find((x) => x.id === id); return ex ? structuredClone(ex) : { pid: '', date: today(), body: '', lines: [], sigMode: d.clinic.sig ? 'saved' : 'draw', sig: d.clinic.sig || null }; });
  const [padKey, setPadKey] = useState(0);
  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const p = r.pid && P(db, r.pid), pts = [...db.patients].sort((a, b) => a.name.localeCompare(b.name));
  const setLine = (i, patch) => set({ lines: r.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const save = (print) => {
    if (!r.pid) return toast('Choose a patient');
    const saved = { ...r, id: r.id || uid() };
    update((d) => { const i = d.reports.findIndex((x) => x.id === saved.id); if (i >= 0) d.reports[i] = saved; else d.reports.push(saved); });
    toast('Report saved'); go('/reports');
    if (print) printReport(db, saved);
  };
  const saveDefault = () => { if (!r.sig) return toast('Draw or upload a signature first'); update((d) => { d.clinic.sig = r.sig; }); toast('Saved as the doctor’s signature'); };
  return (
    <>
      <Head title={r.id ? 'Edit report' : 'New report'}><button type="button" className="btn ghost" onClick={() => go('/reports')}>Cancel</button><button type="button" className="btn" onClick={() => save(false)}>Save</button><button type="button" className="btn primary" onClick={() => save(true)}>Save and print</button></Head>
      <div className="split" style={{ gridTemplateColumns: '420px minmax(0,1fr)' }}>
        <div className="left" style={{ position: 'static', maxHeight: 'none' }}>
          <label>Patient<select value={r.pid} onChange={(e) => set({ pid: e.target.value, ...(e.target.value ? repDefaults(db, P(db, e.target.value)) : {}) })}><option value="">Choose a patient</option>{pts.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.reg}</option>)}</select></label>
          {p ? (
            <>
              <label>Date<input type="date" value={r.date} onChange={(e) => set({ date: e.target.value || today() })} /></label>
              <label>Report text<textarea rows="9" value={r.body} onChange={(e) => set({ body: e.target.value })} /></label>
              <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set(repDefaults(db, p))}>Rewrite from record</button>
              <div className="lbl" style={{ marginTop: 14 }}>Cost of the treatment</div>
              {r.lines.map((l, i) => (
                <div className="row-actions" style={{ marginBottom: 6 }} key={i}>
                  <input value={l.name} style={{ flex: 1 }} aria-label={`Item ${i + 1}`} onChange={(e) => setLine(i, { name: e.target.value })} />
                  <input type="number" min="0" value={l.amount} style={{ width: 100 }} aria-label={`Amount ${i + 1}`} onChange={(e) => setLine(i, { amount: +e.target.value || 0 })} />
                  <button type="button" className="icon" aria-label={`Remove item ${i + 1}`} onClick={() => set({ lines: r.lines.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
              <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ lines: [...r.lines, { name: '', amount: 0 }] })}>+ Add line</button>
              <p className="sm" style={{ margin: '8px 0 0' }}>Total <b>{inr(total(r))}</b></p>
              <div className="lbl" style={{ marginTop: 16 }}>Digital signature</div>
              <div style={{ marginBottom: 8 }}><Segmented label="Signature" value={r.sigMode} options={[['saved', 'Saved signature'], ['draw', 'Draw'], ['upload', 'Upload image'], ['none', 'None']]} onChange={(v) => set({ sigMode: v, sig: v === 'saved' ? db.clinic.sig || null : v === 'none' ? null : r.sig })} /></div>
              {r.sigMode === 'draw' && <>
                <div className="sigbox"><SignaturePad key={padKey} ink="#1b2a6b" onChange={(d) => set({ sig: d })} /></div>
                <div className="row-actions" style={{ marginTop: 6 }}><button type="button" className="btn sm ghost" onClick={() => { set({ sig: null }); setPadKey(padKey + 1); }}>Clear</button><button type="button" className="btn sm" onClick={saveDefault}>Save as the doctor’s signature</button></div>
              </>}
              {r.sigMode === 'upload' && <>
                <input type="file" accept="image/*" aria-label="Signature image" onChange={(e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => set({ sig: rd.result }); rd.readAsDataURL(f); }} />
                <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={saveDefault}>Save as the doctor’s signature</button>
              </>}
              {r.sigMode === 'saved' && !db.clinic.sig && <p className="sm muted">No saved signature yet. Draw or upload one and save it.</p>}
            </>
          ) : <p className="sm muted">Choose a patient. The report fills in from their record, and you can edit every word.</p>}
        </div>
        <div>{p && <div className="preview" data-testid="report-preview"><ReportDoc db={db} r={r} /></div>}</div>
      </div>
    </>
  );
}
