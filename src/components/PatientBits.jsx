// Pieces of a patient's sheet reused across pages.
import { fmtD, fmtS, inr } from '../logic/format.js';
import { ageOf } from '../logic/age.js';
import { sheetRows } from '../logic/balance.js';
import { alertsOf, itemText } from '../data/selectors.js';

export function Head({ title, sub, children }) {
  return <div className="phead"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>{children && <div className="pact">{children}</div>}</div>;
}

const KV = ({ l, v }) => <div><span>{l}</span>{v || '–'}</div>;

// What the patient filled in on the form.
export function FormCard({ p }) {
  const al = alertsOf(p);
  return (
    <div className="sheetcard">
      <h2>Patient form · Reg. {p.reg} · {fmtD(p.created)}</h2>
      <div className="kv">
        <KV l="Age / Sex" v={`${ageOf(p) ?? '–'} / ${p.sex || '–'}`} /><KV l="Mobile" v={p.mobile} /><KV l="Profession" v={p.prof} />
        <KV l="Address" v={p.address} /><KV l="Referred by" v={p.ref} /><KV l="Emergency contact" v={p.emerg} />
      </div>
      <div className="medline">
        {al.length ? <>Under treatment for / alerts: {al.map((a, i) => <span key={a}>{i > 0 && ', '}<b>{a}</b></span>)}</> : 'No medical conditions ticked. No allergies.'}
        {p.forOther && ` · Filled by ${p.forOther.name} (${p.forOther.rel})`} · {p.sig ? 'Declaration signed' : 'Not signed'}
      </div>
      <div className="complaint"><span className="sm muted">Main complaint</span><br />{p.complaint || '–'}</div>
    </div>
  );
}

// Date · Treatment record · Payment · Balance
export function SheetTable({ db, pid, extra }) {
  const rows = sheetRows(db, pid, extra);
  return (
    <div className="tw" tabIndex={0} role="region" aria-label="Treatment record">
      <table className="sheet">
        <thead><tr><th>Date</th><th>Treatment record</th><th className="num">Payment</th><th className="num">Balance</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} style={r.pending ? { background: 'var(--sunk)', fontWeight: 600 } : undefined}>
              <td>{fmtS(r.date)}</td><td>{r.text}{r.charge ? <span className="muted"> ({inr(r.charge)})</span> : null}</td>
              <td className="num">{r.paid ? inr(r.paid) : '–'}</td><td className="num" style={r.balance > 0 ? { color: 'var(--bad)' } : undefined}>{inr(r.balance)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="4" className="muted">No visits yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function VisitsList({ db, pid, n = 99 }) {
  const vs = db.visits.filter((v) => v.pid === pid && v.stage !== 'checkout').sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
  if (!vs.length) return <p className="sm muted">First visit.</p>;
  return (
    <ol className="tl">
      {vs.map((v) => (
        <li key={v.id}>
          <div className="tl-h"><b>{fmtD(v.date)}</b><span className="sm muted">{inr(v.total)}</span></div>
          <div>{v.services.map(itemText).join(', ')}</div>
          {v.notes && <div className="sm muted">{v.notes}</div>}
          {v.rx && <div className="rx">℞ {v.rx}</div>}
        </li>
      ))}
    </ol>
  );
}
