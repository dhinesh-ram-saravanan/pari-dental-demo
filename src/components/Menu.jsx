import { useEffect, useRef, useState } from 'react';

// The ⋯ button: secondary actions for a row. items: [{ label, onClick }] or [{ label, href }].
export default function Menu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="menuwrap" ref={ref}>
      <button type="button" className={'dots' + (open ? ' on' : '')} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>⋯</button>
      {open && (
        <span className="menu" role="menu">
          {items.map((it) => it.href
            ? <a key={it.label} role="menuitem" href={it.href} target={it.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" onClick={() => setOpen(false)}>{it.label}</a>
            : <button key={it.label} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}>{it.label}</button>)}
        </span>
      )}
    </span>
  );
}
