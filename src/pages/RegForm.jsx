import { useEffect, useRef, useState } from 'react';
import { Segmented, Pills, Field } from '../components/controls.jsx';
import SignaturePad from '../components/SignaturePad.jsx';
import { useDb, toast } from '../data/store.js';
import { validateReg, mobileClash, digits, DIGIT_FIELDS } from '../logic/validation.js';
import { ageOf } from '../logic/age.js';
import { today, fmtD } from '../logic/format.js';
import { MED, DECL, TITLES } from '../data/constants.js';

// The clinic's paper form. Used by reception, the patient tablet and the QR form.
export default function RegForm({ initial, kiosk, onSave }) {
  const db = useDb();
  const [r, setR] = useState(initial);
  const [E, setE] = useState({});
  const [sigKey, setSigKey] = useState(0);
  const dupOk = useRef(false), form = useRef(null), jump = useRef(false);
  const set = (k, v) => { setR((x) => ({ ...x, [k]: v })); setE((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; }); };
  useEffect(() => {
    if (!jump.current) return;
    jump.current = false;
    form.current?.querySelector('.bad, .badbtn, .badbox')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [E]);

  const input = (k, label, o = {}) => (
    <Field label={label} error={E[k]} req={o.req} style={o.style}>
      <input type={o.type || 'text'} value={r[k] ?? ''} inputMode={k in DIGIT_FIELDS ? 'numeric' : undefined} placeholder={o.ph} max={o.type === 'date' ? today() : undefined}
        aria-required={o.req || undefined} aria-invalid={!!E[k] || undefined} autoComplete="off"
        onChange={(e) => {
          const v = k in DIGIT_FIELDS ? digits(e.target.value, DIGIT_FIELDS[k]) : e.target.value;
          set(k, v);
          if (k === 'dob' && v && v <= today()) set('age', String(ageOf({ dob: v })));
        }} />
    </Field>
  );

  function submit(e) {
    e.preventDefault();
    const errs = validateReg(r);
    if (Object.keys(errs).length) { jump.current = true; setE(errs); toast('Please check the highlighted fields'); return; }
    const clash = mobileClash(db, r);
    if (clash && !dupOk.current && !kiosk) { dupOk.current = true; toast(`Note: ${clash.name} (Reg. ${clash.reg}) has the same mobile. Press again to save anyway.`); return; }
    onSave(r);
  }

  return (
    <form ref={form} onSubmit={submit} noValidate>
      <p className="sm muted" style={{ margin: '0 0 10px' }}>Fields marked <span className="req">*</span> are needed.</p>
      <section className="panel"><h2>Patient details</h2>
        <div className="fgrid3">
          {input('name', 'Full name', { req: true, style: { gridColumn: 'span 2' } })}
          <Field label="Title"><select value={r.title} onChange={(e) => set('title', e.target.value)}>{TITLES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        </div>
        <div className="fgrid3">
          <div className={E.sex ? 'bad' : ''}>
            <div className="lbl">Sex<span className="req" aria-hidden="true">*</span></div>
            <Segmented label="Sex" value={r.sex} options={[['M', 'Male'], ['F', 'Female']]} onChange={(v) => { set('sex', v); if (v === 'M') setR((x) => ({ ...x, preg: false, nurse: false })); }} />
            {E.sex && <em role="alert">{E.sex}</em>}
          </div>
          {input('dob', 'Date of birth', { type: 'date' })}
          {input('age', 'Age', { req: !r.dob, ph: r.dob ? 'from date of birth' : '' })}
        </div>
        {input('address', 'Address', { req: true })}
        <div className="fgrid">
          {input('mobile', 'Mobile number', { req: true, ph: '10 digits' })}{input('email', 'Email', { type: 'email' })}
          {input('emergNo', 'Emergency contact number', { ph: '10 digits' })}{input('emergRel', 'Relation to patient', { ph: 'e.g. Husband' })}
          {input('prof', 'Profession')}{input('office', 'Office phone')}{input('ref', 'Referred by')}{input('phys', 'Family physician')}{input('physPh', 'Doctor’s phone')}
        </div>
      </section>
      <section className="panel"><h2>Are you currently undergoing treatment for any of these?</h2>
        <p className="sm muted" style={{ margin: '-6px 0 10px' }}>Tap all that apply.</p>
        <Pills
          options={[...MED.map((m) => [m, m, r.med.includes(m)]), ...(r.sex === 'F' ? [['preg', 'Pregnant', r.preg], ['nurse', 'Nursing a child', r.nurse]] : [])]}
          onToggle={(v) => (v === 'preg' || v === 'nurse' ? set(v, !r[v]) : set('med', r.med.includes(v) ? r.med.filter((m) => m !== v) : [...r.med, v]))} />
        {input('other', 'Any other (please specify)')}{input('allergy', 'Allergic to any medicines? (specify)', { ph: 'Leave blank if none' })}{input('complaint', 'Your main complaint', { req: true })}
      </section>
      <section className="panel"><h2>Declaration</h2><p className="decl">{DECL}</p>
        <button type="button" className={'agree' + (r.consent ? ' on' : '') + (E.consent ? ' badbtn' : '')} aria-pressed={r.consent} onClick={() => set('consent', !r.consent)}><span>{r.consent ? '✓' : ''}</span>I agree</button>
        {E.consent && <em className="errline" role="alert">{E.consent}</em>}
        <div className="lbl" style={{ marginTop: 14 }}>Signature<span className="req" aria-hidden="true">*</span></div>
        <div className={'sigwrap' + (E.sig ? ' badbox' : '')}>
          <SignaturePad key={sigKey} initial={r.sigData} onChange={(d) => { setR((x) => ({ ...x, sig: true, sigData: d })); setE((x) => ({ ...x, sig: undefined })); }} />
          <button type="button" className="btn sm ghost" onClick={() => { setR((x) => ({ ...x, sig: false, sigData: null })); setSigKey(sigKey + 1); }}>Clear</button>
        </div>
        {r.sig && !r.sigData && <p className="sm muted" style={{ margin: '6px 0 0' }}>Already signed on the original form.</p>}
        {E.sig && <em className="errline" role="alert">{E.sig}</em>}
        <div className="lbl" style={{ marginTop: 14 }}>Form filled by</div>
        <Segmented label="Form filled by" value={r.forOther ? 'other' : 'self'} options={[['self', 'The patient'], ['other', 'Someone else for the patient']]} onChange={(v) => set('forOther', v === 'other')} />
        {r.forOther && <div className="fgrid" style={{ marginTop: 10 }}>{input('oName', 'Your name', { req: true })}{input('oRel', 'Relationship to patient', { req: true })}</div>}
      </section>
      {!kiosk && <section className="panel"><h2>Reception</h2><div className="lbl">Patient category</div><Segmented label="Patient category" value={r.cat} options={[['g', 'General'], ['o', 'Orthodontics']]} onChange={(v) => set('cat', v)} /></section>}
      <div className="savebar">
        <div><b>{r.name ? `${r.title} ${r.name}` : 'New patient'}</b><span>{kiosk ? 'Submit, then take a seat' : r.id ? 'Reg. No. ' + r.reg : `Reg. No. ${db.nextReg} · ${fmtD(today())}`}</span></div>
        <button className="btn primary lg">{kiosk ? 'Submit' : r.id ? 'Save details' : 'Register and add to today'}</button>
      </div>
    </form>
  );
}
