import { useEffect } from 'react';

export default function Modal({ title, onClose, children, maxWidth, center }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel wide" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth, textAlign: center ? 'center' : undefined }}>
        <div className="ph"><h2 style={{ fontSize: 20 }}>{title}</h2><button type="button" className="icon" aria-label="Close" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}
