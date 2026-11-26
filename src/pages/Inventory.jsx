import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { SortHeader, Field } from '../components/controls.jsx';
import { Head } from '../components/PatientBits.jsx';
import { useDb, update, toast } from '../data/store.js';
import { invQty, nearExp, invStatus, useStock as takeStock, stockIn } from '../logic/inventory.js';
import { validateStockIn } from '../logic/validation.js';
import { today, fmtD, inr, sortBy } from '../logic/format.js';
import { INV_CATS } from '../data/constants.js';

const LOW = ['Low stock', 'Out of stock'], ORDER = ['Expired', 'Out of stock', 'Low stock', 'Expires soon', 'OK'];
const st = (i) => invStatus(i)[1];
const SORT = { name: (i) => i.name.toLowerCase(), cat: (i) => i.cat, qty: invQty, min: (i) => i.min, exp: (i) => nearExp(i) || '9999', status: (i) => ORDER.indexOf(st(i)) };
const COLS = [['name', 'Item'], ['cat', 'Category'], ['qty', 'In stock', 'num'], ['min', 'Alert below', 'num'], ['exp', 'Expiry'], ['status', 'Status']];

function StockIn({ db, itemId, onClose }) {
  const it0 = db.inventory.find((i) => i.id === itemId);
  const [f, setF] = useState({ itemId: itemId || '', name: '', cat: INV_CATS[0], unit: '', qty: '', cost: '', vendor: it0?.batches.at(-1)?.vendor || '', date: today(), expiry: '', min: it0 ? String(it0.min) : '' });
  const set = (k, v) => setF({ ...f, [k]: v });
  const submit = (e) => {
    e.preventDefault();
    const err = validateStockIn(f);
    if (err) return toast(err);
    const it = update((d) => stockIn(d, f));
    toast(`${f.qty} ${it.unit} of ${it.name} added · ${inr(+f.cost)} added to expenses`); onClose();
  };
  return (
    <Modal title="Stock in · purchase" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Item"><select value={f.itemId} onChange={(e) => { const it = db.inventory.find((i) => i.id === e.target.value); setF({ ...f, itemId: e.target.value, min: it ? String(it.min) : f.min }); }}><option value="">+ New item</option>{db.inventory.map((i) => <option key={i.id} value={i.id}>{i.name} ({invQty(i)} {i.unit})</option>)}</select></Field>
        {!f.itemId && <div className="fgrid3">
          <Field label="Item name" req><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Category"><select value={f.cat} onChange={(e) => set('cat', e.target.value)}>{INV_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Unit"><input value={f.unit} placeholder="box, pack, syringe" onChange={(e) => set('unit', e.target.value)} /></Field>
        </div>}
        <div className="fgrid3">
          <Field label="Quantity" req><input type="number" min="1" step="1" inputMode="numeric" value={f.qty} onChange={(e) => set('qty', e.target.value)} /></Field>
          <Field label="Total cost (₹)" req><input type="number" min="0" value={f.cost} onChange={(e) => set('cost', e.target.value)} /></Field>
          <Field label="Vendor"><input value={f.vendor} onChange={(e) => set('vendor', e.target.value)} /></Field>
        </div>
        <div className="fgrid3">
          <Field label="Purchase date"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Expiry date" hint="Leave blank if it does not expire"><input type="date" min={today()} value={f.expiry} onChange={(e) => set('expiry', e.target.value)} /></Field>
        </div>
        <Field label="Alert me when stock falls below" req><input type="number" min="0" value={f.min} placeholder="e.g. 2" onChange={(e) => set('min', e.target.value)} /></Field>
        <p className="sm muted">The cost is added to this month’s expenses.</p>
        <button className="btn primary">Add stock</button>
      </form>
    </Modal>
  );
}

function UseStock({ db, itemId, onClose }) {
  const [f, setF] = useState({ qty: '1', note: '' }), it = db.inventory.find((i) => i.id === itemId);
  const submit = (e) => {
    e.preventDefault();
    const r = update((d) => takeStock(d, itemId, +f.qty, f.note));
    if (!r.ok) return toast(r.msg);
    toast(r.low ? `Low stock: ${it.name} is down to ${invQty(r.item)}. Time to reorder.` : `${f.qty} ${it.unit} of ${it.name} used`); onClose();
  };
  return (
    <Modal title={`Record use · ${it.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="fgrid"><Field label="Quantity used"><input type="number" min="1" step="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field><Field label="Note"><input value={f.note} placeholder="e.g. patient name or reason" onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
        <p className="sm muted">{invQty(it)} {it.unit} in stock. The earliest expiry is used first.</p>
        <button className="btn primary">Save</button>
      </form>
    </Modal>
  );
}

function Item({ db, it, open, onClose }) {
  const [c, l] = invStatus(it), log = db.invLog.filter((x) => x.itemId === it.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  return (
    <Modal title={it.name} onClose={onClose}>
      <p><span className={'pill ' + c}>{l}</span> &nbsp;<b>{invQty(it)}</b> {it.unit} in stock · {it.cat}</p>
      <label>Alert me when stock falls below<input type="number" min="0" defaultValue={it.min} style={{ width: 120 }} onBlur={(e) => { const v = +e.target.value || 0; if (v !== it.min) { update((d) => { d.inventory.find((i) => i.id === it.id).min = v; }); toast('Alert level saved'); } }} /></label>
      <div className="sec">Batches</div>
      <table className="tbl"><thead><tr><th>Purchased</th><th className="num">Qty left</th><th>Expiry</th><th>Vendor</th><th className="num">Cost</th></tr></thead>
        <tbody>{it.batches.map((b) => <tr key={b.id}><td>{fmtD(b.date)}</td><td className="num">{b.qty}</td><td style={b.expiry && b.expiry < today() ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{b.expiry ? fmtD(b.expiry) : '–'}</td><td className="sm">{b.vendor}</td><td className="num">{inr(b.cost)}</td></tr>)}</tbody></table>
      <div className="sec">History</div>
      {log.map((x) => <div className="row-item" key={x.id}><span className="sm">{fmtD(x.date)} · {x.note}</span><b style={{ color: x.type === 'in' ? 'var(--ok)' : 'var(--bad)' }}>{x.type === 'in' ? '+' : '−'}{x.qty}</b></div>)}
      <div className="row-actions" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => open({ mode: 'use', id: it.id })}>Record use</button><button type="button" className="btn primary" onClick={() => open({ mode: 'in', id: it.id })}>Stock in</button></div>
    </Modal>
  );
}

export default function Inventory() {
  const db = useDb(), items = db.inventory;
  const [f, setF] = useState({ cat: 'all', stat: 'all', q: '' }), set = (k, v) => setF({ ...f, [k]: v });
  const [sort, setSort] = useState({ k: 'name', dir: 1 });
  const [m, setM] = useState(null), close = () => setM(null);
  const cnt = { low: items.filter((i) => LOW.includes(st(i))).length, soon: items.filter((i) => st(i) === 'Expires soon').length, exp: items.filter((i) => st(i) === 'Expired').length };
  const att = [cnt.low && `${cnt.low} low on stock`, cnt.soon && `${cnt.soon} expiring within 30 days`, cnt.exp && `${cnt.exp} expired`].filter(Boolean);
  const s = f.q.trim().toLowerCase();
  const list = sortBy(items.filter((i) => (!s || i.name.toLowerCase().includes(s)) && (f.cat === 'all' || i.cat === f.cat) &&
    (f.stat === 'all' || (f.stat === 'low' ? LOW.includes(st(i)) : f.stat === 'soon' ? st(i) === 'Expires soon' : st(i) === 'Expired'))), sort, SORT);
  const it = m?.id && items.find((i) => i.id === m.id);
  return (
    <>
      <Head title="Inventory" sub={att.length ? <span style={{ color: 'var(--bad)' }} data-testid="inv-attention">Needs attention: {att.join(', ')}.</span> : 'Everything is stocked.'}><button type="button" className="btn primary" onClick={() => setM({ mode: 'in' })}>+ Stock in</button></Head>
      <div className="filters">
        <label>Category<select value={f.cat} onChange={(e) => set('cat', e.target.value)}><option value="all">All</option>{INV_CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Status<select value={f.stat} onChange={(e) => set('stat', e.target.value)}><option value="all">All</option><option value="low">Low stock</option><option value="soon">Expiring soon</option><option value="exp">Expired</option></select></label>
        <label className="grow">Search<input type="search" value={f.q} placeholder="Item name" onChange={(e) => set('q', e.target.value)} /></label>
      </div>
      <div className="list" style={{ overflow: 'auto' }}>
        <table className="tbl">
          <thead><tr>{COLS.map(([k, l, cls]) => <th key={k} className={cls}><SortHeader sort={sort} setSort={setSort} k={k} label={l} /></th>)}</tr></thead>
          <tbody>
            {list.map((i) => { const [c, l] = invStatus(i), e = nearExp(i); return (
              <tr key={i.id} className="click" onClick={() => setM({ mode: 'item', id: i.id })}>
                <td><button type="button" className="linkbtn" style={{ fontWeight: 700, textAlign: 'left' }}>{i.name}</button></td><td className="sm">{i.cat}</td><td className="num"><b>{invQty(i)}</b> <span className="sm muted">{i.unit}</span></td><td className="num sm">{i.min}</td><td className="sm">{e ? fmtD(e) : '–'}</td>
                <td>{l === 'OK' ? <span className="sm muted">OK</span> : <span className={'pill ' + c}>{l}</span>}</td>
              </tr>
            ); })}
            {!list.length && <tr><td colSpan="6" className="muted">No items.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="sm muted">Tap an item to record use, add stock or change its alert level.</p>
      {m?.mode === 'in' && <StockIn db={db} itemId={m.id} onClose={close} />}
      {m?.mode === 'use' && it && <UseStock db={db} itemId={m.id} onClose={close} />}
      {m?.mode === 'item' && it && <Item db={db} it={it} open={setM} onClose={close} />}
    </>
  );
}
