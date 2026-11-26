// Small controls used instead of checkboxes: segmented choice, switch, pills, sort header, KPI tile.
export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
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
    <button type="button" className={'sortb' + (on ? ' on' : '')} aria-label={`Sort by ${label}${on ? (sort.dir > 0 ? ', ascending' : ', descending') : ''}`}
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

// Labelled input with an inline error underneath.
export function Field({ label, error, req, hint, children, className = '', style }) {
  return (
    <label className={(error ? 'bad ' : '') + className} style={style}>
      <span>{label}{req && <span className="req" aria-hidden="true">*</span>}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}
