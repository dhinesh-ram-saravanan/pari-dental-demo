import { useState } from 'react';
import { Head } from '../components/PatientBits.jsx';
import { run, go } from '../data/store.js';
import { addToQueue } from '../data/actions.js';
import { savePatient } from '../logic/validation.js';
import { unpackForm } from '../logic/handoff.js';
import { MED } from '../data/constants.js';

// Reception opens the link a patient sent from their own phone: check, then add to today's queue.
export default function FormIn({ code }) {
  const [{ form, error }] = useState(() => unpackForm(code, MED));
  if (error) return <><Head title="Patient form" /><p className="warnline">{error}</p><button type="button" className="btn" onClick={() => go('/front-desk')}>Back to front desk</button></>;
  const add = () => { run((d) => addToQueue(d, savePatient(d, form, { verified: false }).id, 'QR')); go('/front-desk'); };
  return (
    <>
      <Head title="Form from a patient’s phone" sub="Sent to the clinic on WhatsApp. Check it is the right person, then add them to today." />
      <div className="sheetcard">
        <h2>{form.title} {form.name}</h2>
        <div className="kv">{[['Age / Sex', `${form.age || '–'} / ${form.sex}`], ['Mobile', form.mobile], ['Address', form.address], ['Allergy', form.allergy], ['Conditions', form.med.join(', ')], ['Signed', form.paperSig ? 'On their phone' : form.typedSig ? 'Typed name' : 'No']].map(([l, v]) => <div key={l}><span>{l}</span>{v || '–'}</div>)}</div>
        <div className="complaint"><span className="sm muted">Main complaint</span><br />{form.complaint}</div>
      </div>
      <div className="row-actions" style={{ marginTop: 14 }}><button type="button" className="btn primary lg" onClick={add}>Add {form.name} to today’s queue</button><button type="button" className="btn ghost" onClick={() => go('/front-desk')}>Not now</button></div>
    </>
  );
}
