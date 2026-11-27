const TOOTH = 'M7 3c-2.5 0-4 2-4 4.5 0 3 1.5 4.5 2 7.5.5 3 1 6 2.5 6s1.8-3 2.5-5c.5-1.3 1.5-1.3 2 0 .7 2 1 5 2.5 5s2-3 2.5-6c.5-3 2-4.5 2-7.5C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z';
const PATHS = {
  tooth: TOOTH, doctor: TOOTH,
  'front-desk': 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  overview: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  treatment: 'M4 5h16M4 10h16M4 15h16M4 20h10',
  info: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  team: 'M16 19c0-2.8-2.7-5-6-5s-6 2.2-6 5M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 8v6M17 11h6',
  inventory: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  lab: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9',
  reports: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  clinic: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  patients: 'M16 19c0-2.8-2.7-5-6-5s-6 2.2-6 5M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17 4.5a3 3 0 0 1 0 6M21 19c0-2.2-1.4-4-3.5-4.7',
};
export default function Icon({ name }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}
