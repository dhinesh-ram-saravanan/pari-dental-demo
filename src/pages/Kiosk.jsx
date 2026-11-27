import { useEffect, useState } from 'react';
import RegForm from './RegForm.jsx';
import { useDb, update, toast, go } from '../data/store.js';
import { tq } from '../data/selectors.js';
import { addToQueue } from '../data/actions.js';
import { emptyP, savePatient, mobileDigits, MOBILE } from '../logic/validation.js';
import { today, fmtD } from '../logic/format.js';

// Patient-facing: the tablet at the desk (#/tablet) and the phone form behind the QR code (#/form).
export default function Kiosk({ qr }) {
  const db = useDb();
  const [k, setK] = useState({ step: qr ? 'form' : 'start', mobile: '' });
  // The phone form behind the QR code has no way into the staff screens.
  const exit = qr ? null : <button type="button" className="kexit" onClick={() => go('/front-desk')}>Staff: exit tablet mode</button>;
  const restart = () => setK({ step: 'start', mobile: '' });
  // The desk tablet goes back to the welcome screen for the next patient.
  useEffect(() => { if (qr || k.step !== 'done') return; const t = setTimeout(restart, 15000); return () => clearTimeout(t); }, [qr, k.step]);
  const queue = (pid, name) => {
    const r = update((d) => addToQueue(d, pid, qr ? 'QR' : 'Tablet'));
    const token = r.token || tq(db).find((x) => x.pid === pid && x.status !== 'done')?.token || '–';
    setK({ step: 'done', token, name: name.split(' ')[0] });
    window.scrollTo(0, 0);
  };
  if (k.step === 'start') return (
    <div className="kiosk"><h1>{db.clinic.name}</h1><p className="sub">Welcome. Please tell us who you are.</p>
      <div className="kbig"><button type="button" className="kbtn" onClick={() => setK({ step: 'form', mobile: '' })}>This is my first visit</button><button type="button" className="kbtn" onClick={() => setK({ ...k, step: 'old' })}>I have visited before</button></div>{exit}
    </div>
  );
  if (k.step === 'old') return (
    <div className="kiosk"><h1>Welcome back</h1><p className="sub">Enter your mobile number</p>
      <form noValidate style={{ marginTop: 20 }} onSubmit={(e) => {
        e.preventDefault();
        if (!MOBILE.test(k.mobile)) return toast('Enter your 10-digit mobile number');
        const p = db.patients.find((x) => x.mobile === k.mobile);
        if (p) queue(p.id, p.name); else { toast('We could not find that number. Please fill the form.'); setK({ ...k, step: 'form' }); }
      }}>
        <label>Mobile number<span className="telwrap"><span aria-hidden="true">+91</span><input type="tel" inputMode="numeric" placeholder="10 digits" autoComplete="tel-national" value={k.mobile} onChange={(e) => setK({ ...k, mobile: mobileDigits(e.target.value) })} /></span></label>
        <div className="row-actions"><button className="btn primary lg">Continue</button><button type="button" className="btn ghost lg" onClick={restart}>Back</button></div>
      </form>{exit}
    </div>
  );
  if (k.step === 'form') return (
    <div className="kiosk" style={{ maxWidth: 760 }}><h1>Patient form</h1><p className="sub">{db.clinic.name} · {fmtD(today())}</p>
      <RegForm kiosk initial={{ ...emptyP(), mobile: k.mobile }} onSave={(r) => { const p = update((d) => savePatient(d, r, { verified: false })); queue(p.id, p.name); }} />{exit}
    </div>
  );
  return (
    <div className="kiosk kdone"><p className="sub">Your token number</p><div className="ktok" data-testid="token">{k.token}</div>
      <h1 style={{ fontSize: 28 }}>Please take a seat, {k.name}</h1><p className="sub">The doctor will call you in turn.{qr ? ' You can close this page now.' : ''}</p>
      {!qr && <button type="button" className="btn lg" style={{ marginTop: 18 }} onClick={restart}>Next patient</button>}{exit}
    </div>
  );
}
