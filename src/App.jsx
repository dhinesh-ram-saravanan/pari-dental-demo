import { useEffect } from 'react';
import Icon from './components/icons.jsx';
import { useDb, useUi, setUi, go, useRoute } from './data/store.js';
import { navCounts } from './data/selectors.js';
import FrontDesk from './pages/FrontDesk.jsx';
import Calendar from './pages/Calendar.jsx';
import Register from './pages/Register.jsx';
import Kiosk from './pages/Kiosk.jsx';
import Doctor from './pages/Doctor.jsx';
import Overview from './pages/Overview.jsx';
import TreatmentRegister from './pages/TreatmentRegister.jsx';
import PatientInfo from './pages/PatientInfo.jsx';
import PatientRecord from './pages/PatientRecord.jsx';
import Inventory from './pages/Inventory.jsx';
import { Reports, ReportEdit } from './pages/Reports.jsx';
import Team from './pages/Team.jsx';
import Clinic from './pages/Clinic.jsx';
import QrModal from './pages/QrModal.jsx';
import BookModal from './pages/BookModal.jsx';
import CheckoutSheet from './pages/CheckoutSheet.jsx';

const LABELS = { '/front-desk': 'Front desk', '/calendar': 'Calendar', '/doctor': 'Today', '/overview': 'Overview', '/patients/treatment': 'Treatment register', '/patients/info': 'Patient information', '/inventory': 'Inventory', '/reports': 'Reports', '/team': 'Team', '/clinic': 'Clinic' };
const NAV = {
  reception: ['/front-desk', '/calendar', '#Patients', '/patients/treatment', '/patients/info', '#Clinic', '/inventory', '/reports', '/team'],
  doctor: ['/doctor', '/overview', '#Patients', '/patients/treatment', '/patients/info', '#Clinic', '/reports', '/inventory', '/clinic'],
};
const HOME = { reception: '/front-desk', doctor: '/doctor' };

function page(route) {
  const [, a, b] = route.split('/');
  if (a === 'front-desk') return <FrontDesk />;
  if (a === 'calendar') return <Calendar />;
  if (a === 'register') return <Register id={b} key={b || 'new'} />;
  if (a === 'doctor') return <Doctor />;
  if (a === 'overview') return <Overview />;
  if (a === 'patients') return b === 'treatment' ? <TreatmentRegister /> : b === 'info' || !b ? <PatientInfo /> : <PatientRecord id={b} key={b} />;
  if (a === 'inventory') return <Inventory />;
  if (a === 'reports') return b ? <ReportEdit id={b} key={b} /> : <Reports />;
  if (a === 'team') return <Team />;
  if (a === 'clinic') return <Clinic />;
  return null;
}

function Sidebar({ route }) {
  const db = useDb(), ui = useUi(), counts = navCounts(db);
  const inPatients = route.startsWith('/patients'), open = ui.pOpen || inPatients;
  const active = (k) => route === k || route.startsWith(k + '/') || (k === '/front-desk' && route.startsWith('/register')) || (k === '/patients/treatment' && inPatients && route !== '/patients/info');
  return (
    <aside id="side">
      <div className="brand"><span className="logo"><Icon name="tooth" /></span><div><b>{db.clinic.name}</b><span className="demo">Demo</span></div></div>
      <nav id="nav" aria-label="Main">
        {NAV[ui.role].filter((k) => !k.startsWith('/patients') || open).map((k) => k === '#Patients'
          ? <button key={k} type="button" className="navgrp tog" aria-expanded={open} onClick={() => { if (open && inPatients) go(HOME[ui.role]); setUi({ pOpen: !open }); }}><Icon name="patients" /><span>Patients</span><i>{open ? '▾' : '▸'}</i></button>
          : k[0] === '#' ? <div key={k} className="navgrp">{k.slice(1)}</div>
            : <a key={k} href={'#' + k} className={(k.startsWith('/patients') ? 'sub ' : '') + (active(k) ? 'on' : '')} aria-current={active(k) ? 'page' : undefined}><Icon name={k.split('/').pop()} />{LABELS[k]}{counts[k] ? <span className="count">{counts[k]}</span> : null}</a>)}
      </nav>
      <div className="who">
        <div className="lbl">Using the system as</div>
        <div className="role-sw" role="group" aria-label="Role">
          {[['reception', 'Reception'], ['doctor', 'Doctor']].map(([r, l]) => <button key={r} type="button" className={ui.role === r ? 'on' : ''} aria-pressed={ui.role === r} onClick={() => { setUi({ role: r, co: null, book: null }); go(HOME[r]); }}>{l}</button>)}
        </div>
        <p className="sm muted" style={{ margin: '10px 0 0' }}>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      </div>
    </aside>
  );
}

export default function App() {
  const ui = useUi(), route = useRoute();
  const kiosk = route === '/form' || route === '/tablet';
  const view = kiosk ? null : page(route);
  useEffect(() => { if (!kiosk && !view) go(HOME[ui.role]); }, [kiosk, view, ui.role]);
  // Print whatever was put in ui.print, then clear it.
  useEffect(() => {
    if (!ui.print) return;
    const done = () => setUi({ print: null });
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', done);
  }, [ui.print]);
  return (
    <>
      <div className={'app' + (kiosk ? ' kiosk bare' : '')}>
        {kiosk ? <aside id="side" hidden /> : <Sidebar route={route} />}
        <main id="main">{kiosk ? <Kiosk qr={route === '/form'} /> : view}{ui.qr && <QrModal />}{ui.book && <BookModal />}{ui.co && <CheckoutSheet />}</main>
      </div>
      <div id="print">{ui.print}</div>
      <div className={'toast' + (ui.toast ? ' show' : '')} id="toast" role="status" aria-live="polite">{ui.toast}</div>
    </>
  );
}
