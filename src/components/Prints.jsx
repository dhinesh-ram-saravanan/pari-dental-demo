// Print layouts. Rendered into #print (hidden on screen) and sent to the printer.
import { fmtS, fmtD, inr, sum, longDate } from '../logic/format.js';
import { ageOf } from '../logic/age.js';
import { sheetRows } from '../logic/balance.js';
import { P } from '../data/selectors.js';
import { MED, MARKS, DECL, DOCTOR } from '../data/constants.js';

const Row = ({ a, b, c, d }) => <div className="pr"><div style={{ flex: 1 }}><span>{a}</span> {b}</div>{c && <div style={{ flex: 1 }}><span>{c}</span> {d}</div>}</div>;
const GREEN = '#2e7d4f';
const planItems = (c) => c.items.filter((x, i, a) => x.name !== 'Monthly adjustment' || a.findIndex((y) => y.name === x.name) === i).map((x) => x.name + (x.teeth.length ? ` (${x.teeth.join(', ')})` : '')).join(', ');

// The clinic's green paper form: front (details, history, declaration, examination) and back (treatment record).
export function RecordPrint({ db, p }) {
  const ch = db.charts[p.id] || {}, rows = sheetRows(db, p.id);
  const pal = (arr) => arr.map((n, i) => <span key={n}>{i > 0 && ' '}{ch[n] ? <b style={{ color: '#c2261a' }}>{String(n)[1]}</b> : String(n)[1]}</span>);
  return (
    <>
      <div className="pg">
        <h1>PARI DENTAL HOSPITAL</h1>
        <div className="addr">{db.clinic.addr}<br />Mobile: {db.clinic.phone} · e-mail: {db.clinic.email}</div>
        <Row a="Reg. No." b={p.reg} c="Date" d={fmtS(p.created)} /><Row a={'Name: ' + p.title} b={p.name} c="Age / Sex" d={`${ageOf(p) ?? ''} / ${p.sex}`} />
        <Row a="Address" b={p.address} /><Row a="Mobile No." b={p.mobile} c="Emergency Contact No. & Relation" d={p.emerg} />
        <Row a="email" b={p.email} c="D.O.B. / Profession" d={`${p.dob ? fmtS(p.dob) : ''} ${p.prof || ''}`} /><Row a="Office Ph. No." b={p.office} c="Referred by" d={p.ref} />
        <Row a="Family Physician" b={p.phys} c="Doctors Ph. No." d={p.physPh} />
        <p style={{ margin: '4mm 0 2mm' }}>Are you currently undergoing treatment for any of the following:</p>
        <p style={{ margin: 0 }}>{MED.map((m) => `${p.med.includes(m) ? '☑' : '☐'} ${m}`).join('    ')}</p>
        <Row a="Any other" b={p.other} />
        <p style={{ margin: '2mm 0' }}>Women: {p.preg ? '☑' : '☐'} Pregnant &nbsp; {p.nurse ? '☑' : '☐'} Nursing a child</p>
        <Row a="Allergic to any medicines" b={p.allergy} /><Row a="Your Main Complaint" b={p.complaint} />
        <p style={{ fontSize: '9.5pt' }}>{DECL}</p>
        <Row a="Patient Signature" b={p.sigData ? <img src={p.sigData} alt="Signature" style={{ height: '12mm', verticalAlign: 'middle' }} /> : p.sig ? '(signed electronically)' : ''} c="Date" d={fmtS(p.created)} />
        <div style={{ borderTop: `1.5px solid ${GREEN}`, marginTop: '4mm', paddingTop: '3mm' }}>
          <b style={{ color: GREEN }}>On Examination</b>
          <div className="palm">{pal([18, 17, 16, 15, 14, 13, 12, 11])} | {pal([21, 22, 23, 24, 25, 26, 27, 28])}<br />{pal([48, 47, 46, 45, 44, 43, 42, 41])} | {pal([31, 32, 33, 34, 35, 36, 37, 38])}</div>
          <p style={{ margin: 0 }}>{Object.entries(ch).map(([t, s]) => `${t}: ${MARKS[s]}`).join(' · ')}</p>
          <b style={{ color: GREEN }}>Treatment Plan</b>
          {db.cases.filter((c) => c.pid === p.id).map((c) => <p key={c.id} style={{ margin: '1mm 0' }}>{c.title}: {planItems(c)}</p>)}
        </div>
      </div>
      <div className="pg">
        <table className="pt">
          <thead><tr><th style={{ width: '16%' }}>Date</th><th>Treatment Record</th><th style={{ width: '14%' }}>Payment</th><th style={{ width: '14%' }}>Balance</th></tr></thead>
          <tbody>
            {rows.map((r, i) => <tr key={i}><td>{fmtS(r.date)}</td><td>{r.text}{r.charge ? ` (${inr(r.charge)})` : ''}</td><td>{r.paid ? inr(r.paid) : ''}</td><td>{inr(r.balance)}</td></tr>)}
            {Array.from({ length: Math.max(4, 27 - rows.length) }, (_, i) => <tr key={'e' + i}><td /><td /><td /><td /></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Receipt for one visit: what was charged, what was paid, what is carried forward.
export function ReceiptPrint({ db, visit }) {
  const p = P(db, visit.pid), paid = sum(db.payments.filter((x) => x.visitId === visit.id), (x) => x.amount), pays = db.payments.filter((x) => x.visitId === visit.id);
  const before = sheetRows(db, p.id).find((r) => r.id === visit.id), prev = before ? before.balance - visit.total + paid : 0;
  return (
    <div className="pg">
      <h1>PARI DENTAL HOSPITAL</h1>
      <div className="addr">{db.clinic.addr}<br />Mobile: {db.clinic.phone}</div>
      <p style={{ textAlign: 'center', fontWeight: 700, margin: '4mm 0' }}>RECEIPT</p>
      <div className="pr"><div style={{ flex: 1 }}><span>Name</span> {p.title} {p.name}</div><div><span>Reg. No.</span> {p.reg}</div><div><span>Date</span> {fmtS(visit.date)}</div></div>
      <table className="pt" style={{ marginTop: '4mm' }}>
        <thead><tr><th>Treatment</th><th style={{ width: '28%' }}>Amount</th></tr></thead>
        <tbody>
          {visit.services.map((s, i) => <tr key={i}><td>{s.name}{s.teeth?.length ? ` (${s.teeth.join(', ')})` : ''}</td><td>{inr(s.price)}</td></tr>)}
          <tr><td>Previous balance</td><td>{inr(prev)}</td></tr>
          <tr><td><b>Total due</b></td><td><b>{inr(prev + visit.total)}</b></td></tr>
          <tr><td>Received{pays.length ? ` (${pays.map((x) => x.mode).join(', ')})` : ''}</td><td>{inr(paid)}</td></tr>
          <tr><td><b>Balance</b></td><td><b>{inr(prev + visit.total - paid)}</b></td></tr>
        </tbody>
      </table>
      <p style={{ marginTop: '20mm', textAlign: 'right' }}>For {db.clinic.name}</p>
    </div>
  );
}

export function RxPrint({ db, visit }) {
  const p = P(db, visit.pid);
  return (
    <div className="pg">
      <h1>PARI DENTAL HOSPITAL</h1>
      <div className="addr">{db.clinic.addr}<br />Mobile: {db.clinic.phone}</div>
      <div className="pr"><div style={{ flex: 1 }}><span>Name</span> {p.title} {p.name}</div><div><span>Reg. No.</span> {p.reg}</div><div><span>Date</span> {fmtS(visit.date)}</div></div>
      <div className="pr"><div style={{ flex: 1 }}><span>Age / Sex</span> {ageOf(p) ?? ''} / {p.sex}</div>{p.allergy && <div style={{ flex: 2 }}><span>Allergic to</span> <b>{p.allergy}</b></div>}</div>
      <p style={{ fontSize: '20pt', color: GREEN, margin: '6mm 0 2mm' }}>℞</p>
      <p style={{ whiteSpace: 'pre-line', fontSize: '12pt' }}>{visit.rx}</p>
      <p style={{ marginTop: '30mm', textAlign: 'right' }}>{DOCTOR}</p>
    </div>
  );
}

// Dental treatment report, in the clinic's letter format.
export function ReportDoc({ db, r }) {
  const p = P(db, r.pid), tot = sum(r.lines, (l) => l.amount);
  const rs = (n) => '- Rs ' + Number(n || 0).toLocaleString('en-IN');
  return (
    <div className="rdoc">
      <div className="rd-date">{longDate(r.date)}</div>
      <h2>DENTAL TREATMENT REPORT</h2>
      <p className="c">To whomsoever it may concern</p><p className="c">(Reg.no: {p.reg})</p>
      <p className="body">{r.body}</p>
      {r.lines.length > 0 && (
        <>
          <p className="c">Cost of the treatment as follows</p>
          <table><tbody>
            {r.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td>{rs(l.amount)}</td></tr>)}
            <tr className="tot"><td style={{ textAlign: 'center' }}>TOTAL</td><td>{rs(tot)}</td></tr>
          </tbody></table>
        </>
      )}
      <div className="sign">{r.sig ? <img src={r.sig} alt="Signature" /> : <div style={{ height: 60 }} />}{DOCTOR}<br />For {db.clinic.name}</div>
    </div>
  );
}

export function RegisterPrint({ rows, from, to }) {
  return (
    <div className="rpage wide" style={{ padding: '8mm' }}>
      <h2 style={{ font: '700 14pt Arial', margin: '0 0 4mm' }}>Pari Dental Hospital · Patient treatment register · {fmtD(from)} to {fmtD(to)}</h2>
      <table className="pt" style={{ fontSize: '8.5pt' }}>
        <thead><tr>{['Date', 'ID No.', 'Patient name', 'Age', 'Sex', 'Category', 'Treatment procedure', 'Appointment', 'In', 'Out', 'Duration', 'Remarks', 'Payment', 'Balance', 'Consulted by', 'Mobile no.'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.key}><td>{fmtS(r.date)}</td><td>{r.reg}</td><td>{r.name}</td><td>{r.age}</td><td>{r.sex}</td><td>{r.cat === 'o' ? 'Ortho' : 'General'}</td><td>{r.proc}</td><td>{r.walkin ? 'Walk-in' : r.appt}</td><td>{r.inT}</td><td>{r.outT}</td><td>{r.dur != null ? r.dur + ' min' : ''}</td><td>{r.remarks}</td><td>{r.pay ? inr(r.pay) : ''}</td><td>{inr(r.bal)}</td><td>{r.doc}</td><td>{r.mobile}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
