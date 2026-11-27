import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../components/Modal.jsx';
import { setUi, go } from '../data/store.js';

export default function QrModal() {
  const url = location.href.split('#')[0] + '#/form';
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#141210', light: '#ffffff' } }).then(setSrc); }, [url]);
  const close = () => setUi({ qr: false });
  return (
    <Modal title="Scan to fill the patient form" onClose={close} maxWidth={440} center>
      <div className="qrbox">{src && <img src={src} alt="QR code for the patient form" width="180" height="180" />}</div>
      <p className="sm muted">Print this and keep it at the desk. The patient fills the form on their phone and joins the queue.</p>
      <p className="sm" style={{ wordBreak: 'break-all' }}><a href={url}>{url}</a></p>
      <div className="pact" style={{ justifyContent: 'center' }}><button type="button" className="btn" onClick={close}>Close</button><button type="button" className="btn" onClick={() => setUi({ print: <div className="pg" style={{ textAlign: 'center' }}><h1>PARI DENTAL HOSPITAL</h1><p style={{ fontSize: '16pt', margin: '10mm 0 6mm' }}>Scan to fill the patient form</p><img src={src} alt="" style={{ width: '90mm' }} /><p style={{ marginTop: '6mm' }}>{url}</p></div> })}>Print</button><button type="button" className="btn primary" onClick={() => { close(); go('/form'); }}>Open form as a patient</button></div>
    </Modal>
  );
}
