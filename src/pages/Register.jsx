import RegForm from './RegForm.jsx';
import { Head } from '../components/PatientBits.jsx';
import { getDb, useUi, run, update, toast, go } from '../data/store.js';
import { P } from '../data/selectors.js';
import { addToQueue } from '../data/actions.js';
import { emptyP, formFromPatient, savePatient } from '../logic/validation.js';
import { today, fmtD } from '../logic/format.js';

// Reception: register a new patient, or check a form the patient filled in.
export default function Register({ id }) {
  const db = getDb(), ui = useUi(), p = id && P(db, id);
  if (id && !p) return <Head title="Patient not found" />;
  const save = (r) => {
    if (p) { update((d) => savePatient(d, r)); toast('Patient details saved'); go(ui.role === 'doctor' ? '/patients/' + p.id : '/front-desk'); return; }
    run((d) => addToQueue(d, savePatient(d, r).id, 'Walk-in'));
    go('/front-desk');
  };
  return (
    <>
      <Head title={p ? 'Check patient form' : 'New patient'} sub={p ? `Submitted by the patient · Reg. No. ${p.reg}` : `Reg. No. ${db.nextReg} · ${fmtD(today())}`}>
        <button type="button" className="btn ghost" onClick={() => window.history.back()}>Cancel</button>
      </Head>
      <RegForm initial={p ? formFromPatient(p) : emptyP()} onSave={save} />
    </>
  );
}
