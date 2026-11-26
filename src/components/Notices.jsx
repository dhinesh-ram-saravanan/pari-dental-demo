import { useState } from 'react';
import Menu from './Menu.jsx';
import { useDb, update, toast } from '../data/store.js';
import { noteVisible } from '../data/selectors.js';
import { today, addDays } from '../logic/format.js';

// "Needs attention": each notice has one action, plus ⋯ → Remind me tomorrow / Dismiss.
export default function Notices({ list, title = 'Needs attention', cap = 99, onAct }) {
  const db = useDb();
  const [all, setAll] = useState(false);
  const vis = list.filter((n) => n.nodismiss || noteVisible(db, n.k)), hidden = list.length - vis.length;
  if (!vis.length && !hidden) return null;
  const btn = (a, ghost) => a && (a.href
    ? <a className="btn sm" href={a.href} target="_blank" rel="noopener noreferrer">{a.label}</a>
    : <button type="button" className={'btn sm' + (ghost ? ' ghost' : '')} onClick={() => onAct(a)}>{a.label}</button>);
  return (
    <section className="notices" aria-label={title}>
      <div className="nh">
        <h2 className="grp" style={{ margin: 0 }}>{title} <span>{vis.length}</span></h2>
        {hidden > 0 && <button type="button" className="linkbtn sm" onClick={() => update((d) => { d.notes = { dismissed: {}, snooze: {} }; })}>Show {hidden} hidden</button>}
      </div>
      {vis.length ? (
        <>
          <ul>
            {(all ? vis : vis.slice(0, cap)).map((n) => (
              <li key={n.k} className={'nt t-' + n.tone}>
                <i /><span className="tx">{n.text}</span>
                <span className="acts">
                  {btn(n.act)}{btn(n.act2, true)}
                  {!n.nodismiss && <Menu items={[
                    { label: 'Remind me tomorrow', onClick: () => { update((d) => { d.notes.snooze[n.k] = addDays(today(), 1); }); toast('Hidden until tomorrow'); } },
                    { label: 'Dismiss', onClick: () => { update((d) => { d.notes.dismissed[n.k] = 1; }); toast('Dismissed. “Show hidden” brings it back.'); } },
                  ]} />}
                </span>
              </li>
            ))}
          </ul>
          {vis.length > cap && <button type="button" className="linkbtn sm" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${vis.length}`}</button>}
        </>
      ) : <p className="sm muted" style={{ margin: '6px 0 0' }}>All clear.</p>}
    </section>
  );
}
