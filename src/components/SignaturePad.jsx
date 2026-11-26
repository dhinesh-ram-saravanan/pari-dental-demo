import { useEffect, useRef } from 'react';

// A small canvas to sign on. Calls onChange(dataUrl) after each stroke. Remount (change `key`) to clear.
export default function SignaturePad({ initial, onChange, ink = '#141210', label = 'Signature pad' }) {
  const ref = useRef(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const c = ref.current, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.lineWidth = 2.3; g.lineCap = 'round'; g.strokeStyle = ink;
    if (initial) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, r.width, r.height); im.src = initial; }
    let on = false, moved = false;
    const pt = (e) => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    c.onpointerdown = (e) => { on = true; c.setPointerCapture?.(e.pointerId); const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); };
    c.onpointermove = (e) => { if (!on) return; const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); moved = true; };
    c.onpointerup = c.onpointercancel = () => { on = false; if (moved) cb.current(c.toDataURL()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once; remount to reset
  }, []);
  return <canvas ref={ref} role="img" aria-label={label} style={{ touchAction: 'none' }} />;
}
