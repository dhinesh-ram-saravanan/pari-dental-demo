import { useState } from 'react';
import { SortHeader, Switch } from '../components/controls.jsx';
import { Head } from '../components/PatientBits.jsx';
import { useDb, update, toast } from '../data/store.js';
import { uid, sortBy } from '../logic/format.js';
import { ROLES } from '../data/constants.js';

export function TeamTable() {
  const db = useDb();
  const [sort, setSort] = useState({ k: 'role', dir: 1 });
  const [f, setF] = useState({ name: '', role: 'Junior doctor', phone: '' });
  const handled = (s) => db.visits.filter((v) => v.handled === s.name).length;
  const list = sortBy(db.staff, sort, { name: (s) => s.name.toLowerCase(), role: (s) => ROLES.indexOf(s.role), phone: (s) => s.phone || '', seen: handled, active: (s) => (s.active ? 0 : 1) });
  const edit = (id, patch, msg) => { update((d) => Object.assign(d.staff.find((x) => x.id === id), patch)); toast(msg); };
  const add = (e) => { e.preventDefault(); const name = f.name.trim(); if (!name) return toast('Enter a name'); update((d) => d.staff.push({ id: uid(), ...f, name, active: true })); toast(name + ' added'); setF({ name: '', role: 'Junior doctor', phone: '' }); };
  const H = (k, l, cls) => <th className={cls}><SortHeader sort={sort} setSort={setSort} k={k} label={l} /></th>;
  return (
    <>
      <div className="list" style={{ overflow: 'auto' }}>
        <table className="tbl">
          <thead><tr>{H('name', 'Name')}{H('role', 'Role')}{H('phone', 'Phone')}{H('seen', 'Patients handled', 'num')}{H('active', 'Active')}</tr></thead>
          <tbody>{list.map((s) => (
            <tr key={s.id}><td><b>{s.name}</b></td>
              <td><select style={{ width: 'auto' }} aria-label={`Role of ${s.name}`} value={s.role} onChange={(e) => edit(s.id, { role: e.target.value }, 'Role saved')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
              <td className="sm">{s.phone || '–'}</td><td className="num">{handled(s)}</td>
              <td><Switch on={s.active} label={`${s.name} is active`} onChange={(v) => edit(s.id, { active: v }, s.name + (v ? ' is active' : ' is inactive'))} /></td></tr>
          ))}</tbody>
        </table>
      </div>
      <form className="bar" style={{ marginTop: 14 }} onSubmit={add}>
        <input placeholder="Name, e.g. Dr. Keerthana" aria-label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select style={{ width: 'auto' }} aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        <input placeholder="Phone (optional)" aria-label="Phone" inputMode="numeric" style={{ flex: '0 0 170px', minWidth: 0 }} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d ]/g, '') })} />
        <button className="btn primary">Add to team</button>
      </form>
      <p className="sm muted">Doctors and junior doctors appear under “Handled by” at checkout. Switch Active off when someone leaves; their past records stay.</p>
    </>
  );
}

export default function Team() {
  return <><Head title="Team" sub="Who works at the clinic. Front of house keeps this up to date." /><TeamTable /></>;
}
