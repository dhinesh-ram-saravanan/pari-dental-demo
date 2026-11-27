import { useEffect, useRef, useState } from 'react';

// The ⋯ button: secondary actions for a row. items: [{ label, onClick }] or [{ label, href }].
// Keyboard: opens onto the first item, arrows move, Escape closes and returns to the button.
export default function Menu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null), btn = useRef(null);
  const shut = (refocus) => { setOpen(false); if (refocus) btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    ref.current.querySelector('[role=menuitem]')?.focus();
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('click', out);
    return () => document.removeEventListener('click', out);
  }, [open]);
  const key = (e) => {
    if (!open) return;
    const its = [...ref.current.querySelectorAll('[role=menuitem]')], i = its.indexOf(document.activeElement);
    const to = { ArrowDown: (i + 1) % its.length, ArrowUp: (i - 1 + its.length) % its.length, Home: 0, End: its.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); its[to].focus(); }
    else if (e.key === 'Escape') { e.stopPropagation(); shut(true); }
  };
  if (!items.length) return null;
  return (
    <span className="menuwrap" ref={ref} onKeyDown={key} onBlur={(e) => { if (open && e.relatedTarget && !ref.current.contains(e.relatedTarget)) setOpen(false); }}>
      <button ref={btn} type="button" className={'dots' + (open ? ' on' : '')} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>⋯</button>
      {open && (
        <span className="menu" role="menu">
          {items.map((it) => it.href
            ? <a key={it.label} role="menuitem" href={it.href} target={it.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" onClick={() => setOpen(false)}>{it.label}</a>
            : <button key={it.label} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); shut(true); it.onClick(); }}>{it.label}</button>)}
        </span>
      )}
    </span>
  );
}
