import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// A sheet over the page. Takes focus on open, keeps Tab inside, gives focus back on close.
export default function Modal({ title, onClose, children, maxWidth, center }) {
  const panel = useRef(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement, el = panel.current;
    (el.querySelector('[data-autofocus]') || el).focus();
    document.body.style.overflow = 'hidden';
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus?.(); };
  }, []);
  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} tabIndex={-1} className="panel wide" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth, textAlign: center ? 'center' : undefined }}>
        <div className="ph"><h2 style={{ fontSize: 20 }}>{title}</h2><button type="button" className="icon" aria-label="Close" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}
