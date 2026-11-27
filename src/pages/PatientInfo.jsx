import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { SortHeader } from '../components/controls.jsx';
import { Head } from '../components/PatientBits.jsx';
import { useDb, update, toast, go } from '../data/store.js';
import { parseSheet, importCounts, applyImport, exportRows, lastTreatment } from '../logic/importParse.js';
import { ageOf } from '../logic/age.js';
import { today, fmtS, sortBy } from '../logic/format.js';
import { XCOLS } from '../data/constants.js';

const SORT = { reg: (p) => p.reg, date: (p) => p.created, name: (p) => p.name.toLowerCase(), treat: (p) => p._t.toLowerCase(), mobile: (p) => p.mobile || '', address: (p) => (p.address || '').toLowerCase(), age: (p) => +ageOf(p) || 0, sex: (p) => p.sex || '', dob: (p) => p.dob || '9999' };
const COLS = [['reg', 'Reg No.'], ['date', 'Date'], ['name', 'Name'], ['treat', 'Treatment'], ['mobile', 'Mobile number'], ['address', 'Address'], ['age', 'Age', 'num'], ['sex', 'Sex'], ['dob', 'DOB']];

// SheetJS is large, so it is loaded only when Excel is actually used.
const loadXlsx = () => import('xlsx');

async function exportXL(db) {
  const XLSX = await loadXlsx();
  const rows = exportRows(db), ws = XLSX.utils.json_to_sheet(rows, { header: XCOLS });
  ws['!cols'] = [8, 10, 26, 34, 14, 40, 6, 5, 10].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Patients');
  XLSX.writeFile(wb, `Pari-patients-${today()}.xlsx`);
  toast(`Exported ${rows.length} patients`);
}

// The clinic's patient sheet, with Excel import and export.
export default function PatientInfo() {
  const db = useDb();
  const [f, setF] = useState({ from: '', to: '', cat: 'all', src: 'all', q: '' }), set = (k, v) => setF({ ...f, [k]: v });
  const [sort, setSort] = useState({ k: 'reg', dir: -1 });
  const [imp, setImp] = useState(null);
  const s = f.q.trim().toLowerCase();
  const list = sortBy(db.patients.filter((p) => (!s || p.name.toLowerCase().includes(s) || (p.mobile || '').includes(s) || String(p.reg).includes(s) || (p.address || '').toLowerCase().includes(s)) &&
    (f.cat === 'all' || p.cat === f.cat) && (!f.from || p.created >= f.from) && (!f.to || p.created <= f.to) && (f.src === 'all' || (f.src === 'imp' ? p.imported : !p.imported))).map((p) => ({ ...p, _t: lastTreatment(db, p) })), sort, SORT);
  const onFile = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const XLSX = await loadXlsx();
      // raw: keep CSV dates as typed (dd/mm/yyyy) instead of letting the library read them as US month/day
      const wb = XLSX.read(await file.arrayBuffer(), { raw: true }), rows = parseSheet(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true }), db.patients);
      if (rows.length) setImp({ file: file.name, rows }); else toast('No rows found in that sheet');
    } catch { toast('Could not read that file. Save it as .xlsx and try again.'); }
  };
  const c = imp && importCounts(imp.rows);
  return (
    <>
      <Head title="Patient information register" sub="The clinic’s patient sheet. Import the old Excel records, export everything back to Excel.">
        <label className="btn ghost filebtn">Import Excel<input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} data-testid="import-file" /></label>
        <button type="button" className="btn primary" onClick={() => exportXL(db)}>Export Excel</button>
      </Head>
      <div className="filters">
        <label>Registered from<input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label><label>To<input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
        <label>Category<select value={f.cat} onChange={(e) => set('cat', e.target.value)}><option value="all">All</option><option value="g">General</option><option value="o">Orthodontics</option></select></label>
        <label>Source<select value={f.src} onChange={(e) => set('src', e.target.value)}><option value="all">All</option><option value="imp">Imported from Excel</option><option value="new">Registered here</option></select></label>
        <label className="grow">Search<input type="search" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Name, Reg. No., mobile or address" /></label>
      </div>
      <div className="summary" data-testid="preg-summary"><span><b>{list.length}</b> patients</span><span><b>{db.patients.filter((p) => p.imported).length}</b> imported from Excel</span></div>
      <div className="list" style={{ overflow: 'auto' }} tabIndex={0} role="region" aria-label="Patient information table">
        <table className="tbl reg xl">
          <thead><tr>{COLS.map(([k, l, cls]) => <th key={k} className={cls}><SortHeader sort={sort} setSort={setSort} k={k} label={l} /></th>)}</tr></thead>
          <tbody>
            {list.slice(0, 300).map((p) => (
              <tr key={p.id} className="click" onClick={() => go('/patients/' + p.id)}>
                <td>{p.reg}</td><td className="sm">{fmtS(p.created)}</td>
                <td><a href={'#/patients/' + p.id} onClick={(e) => e.stopPropagation()}><b>{p.name}</b></a>{p.imported && <span className="tag"> Excel</span>}{!p.verified && <span className="tag warnt"> New form</span>}</td>
                <td className="sm wrap">{p._t || <span className="muted">–</span>}</td><td className="sm">{p.mobile || <span className="muted">–</span>}</td><td className="sm wrap">{p.address}</td>
                <td className="num">{ageOf(p)}</td><td>{p.sex}</td><td className="sm">{p.dob ? fmtS(p.dob) : <span className="muted">–</span>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="9" className="muted">No patients for these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.length > 300 && <p className="sm muted">Showing the first 300. Narrow the filters or export to see all.</p>}
      {imp && (
        <Modal title={`Import ${imp.file}`} onClose={() => setImp(null)} maxWidth={820}>
          <p data-testid="import-summary">{c.total} rows found: <b>{c.fresh} new</b>, <b>{c.update}</b> already here (details will be updated){c.skipped > 0 && <>, <b style={{ color: 'var(--bad)' }}>{c.skipped} skipped</b></>}{c.notes > 0 && `, ${c.notes} with notes`}. Columns I, J and K are ignored; DOB is read from column L.</p>
          <div style={{ maxHeight: '46vh', overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10 }} tabIndex={0} role="region" aria-label="Import preview">
            <table className="tbl" style={{ fontSize: 13 }}>
              <thead><tr>{['Row', 'Reg No.', 'Date', 'Name', 'Mobile', 'Age', 'Sex', 'DOB', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{imp.rows.slice(0, 200).map((r) => (
                <tr key={r.line}><td className="sm muted">{r.line}</td><td>{r.reg || '–'}</td><td className="sm">{r.date ? fmtS(r.date) : '–'}</td><td>{r.name || '–'}</td><td className="sm">{r.mobile || '–'}</td><td>{r.age}</td><td>{r.sex}</td><td className="sm">{r.dob ? fmtS(r.dob) : '–'}</td>
                  <td className="sm" style={{ whiteSpace: 'normal', color: r.issues.length ? 'var(--bad)' : r.warn.length ? 'var(--warn)' : 'var(--ok)' }}>{r.issues.length ? 'Skipped: ' + r.issues.join('; ') : r.warn.length ? r.warn.join('; ') : r.exists ? 'Update' : 'New'}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="btn ghost" onClick={() => setImp(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={!c.ok} onClick={() => { const r = update((d) => applyImport(d, imp.rows)); setImp(null); toast(`Imported ${r.fresh} new and updated ${r.updated} patients`); }}>Import {c.ok} records</button>
          </div>
        </Modal>
      )}
    </>
  );
}
