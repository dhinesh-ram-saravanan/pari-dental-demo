import { cloneElement, isValidElement, useId } from 'react';

// Small controls used instead of checkboxes: segmented choice, switch, pills, sort header, KPI tile.
// Segmented behaves like radio buttons: one tab stop, arrow keys move the choice.
export function Segmented({ value, options, onChange, label, describedBy, invalid }) {
  const arrow = (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = Math.max(0, options.findIndex(([v]) => v === value)), n = options[(i + d + options.length) % options.length][0];
    onChange(n);
    requestAnimationFrame(() => e.currentTarget?.querySelector('[aria-checked=true]')?.focus());
  };
  const has = options.some(([v]) => v === value);
  return (
    <div className="seg" role="radiogroup" aria-label={label} aria-describedby={describedBy} aria-invalid={invalid || undefined} onKeyDown={arrow}>
      {options.map(([v, l], i) => <button key={v} type="button" role="radio" aria-checked={value === v} tabIndex={value === v || (!has && i === 0) ? 0 : -1} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Switch({ on, onChange, label }) {
  return <button type="button" className={'switch' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>;
}

// options: [[value, label, isOn]]
export function Pills({ options, onToggle }) {
  return (
    <div className="pills">
      {options.map(([v, l, on]) => <button key={v} type="button" className={'ptog' + (on ? ' on' : '')} aria-pressed={!!on} onClick={() => onToggle(v)}>{l}</button>)}
    </div>
  );
}

export function SortHeader({ sort, setSort, k, label }) {
  const on = sort.k === k;
  return (
    <button type="button" data-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined} className={'sortb' + (on ? ' on' : '')} aria-label={`Sort by ${label}${on ? (sort.dir > 0 ? ', ascending' : ', descending') : ''}`}
      onClick={() => setSort(on ? { k, dir: -sort.dir } : { k, dir: 1 })}>
      {label}{on ? (sort.dir > 0 ? ' ▲' : ' ▼') : ' ↕'}
    </button>
  );
}

export function KpiTile({ kpi, onOpen }) {
  return (
    <button type="button" className={'kpi' + (kpi.tone ? ' k-' + kpi.tone : '')} onClick={() => onOpen(kpi.k)}>
      <span className="kl">{kpi.l}</span><span className="kv">{kpi.v}</span><span className="ks">{kpi.s}</span>
    </button>
  );
}

// Labelled input with a hint and an inline error underneath. The hint and error are tied to the
// input with aria-describedby and sit outside the label, so they are not read as part of its name.
export function Field({ label, error, req, hint, children, className = '', style }) {
  const id = useId(), desc = [hint && id + 'h', error && id + 'e'].filter(Boolean).join(' ') || undefined;
  const wire = (el) => (isValidElement(el) && typeof el.type === 'string' && ['input', 'select', 'textarea'].includes(el.type) ? cloneElement(el, { 'aria-describedby': desc, 'aria-invalid': error ? true : undefined }) : el);
  const kids = isValidElement(children) && children.props.className === 'telwrap'
    ? cloneElement(children, {}, ...[].concat(children.props.children).map(wire)) : wire(children);
  return (
    <div className={'field ' + (error ? 'bad ' : '') + className} style={style}>
      <label><span>{label}{req && <span className="req" aria-hidden="true">*</span>}</span>{kids}</label>
      {hint && <span className="hint" id={id + 'h'}>{hint}</span>}
      {error && <em id={id + 'e'}>{error}</em>}
    </div>
  );
}
