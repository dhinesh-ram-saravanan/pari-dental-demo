import { cap } from './format.js';
import { ageOf } from './age.js';

// Drafts the dental treatment report letter from the patient's record.
export function repDefaults(db, p) {
  const vs = db.visits.filter((v) => v.pid === p.id && v.services.length).sort((a, b) => a.date.localeCompare(b.date));
  const lastCase = vs.length ? vs[vs.length - 1].caseId : null, use = vs.filter((v) => v.caseId === lastCase);
  const lines = [];
  use.forEach((v) => v.services.forEach((s) => {
    if (!s.price) return;
    const nm = s.name + (s.teeth?.length ? ' of ' + s.teeth.join(',') : ''), ex = lines.find((l) => l.name === nm);
    if (ex) ex.amount += s.price; else lines.push({ name: nm, amount: s.price });
  }));
  const decay = Object.entries(db.charts[p.id] || {}).filter(([, m]) => m === 'decay').map(([t]) => t).sort();
  const dx = decay.length ? 'dental caries in tooth no. ' + decay.join(',') : '[diagnosis]';
  const tx = [...new Set(use.flatMap((v) => v.services.filter((s) => !/Consultation|X-ray|OPG|Review/.test(s.name)).map((s) => s.name.toLowerCase() + (s.teeth?.length ? ' of ' + s.teeth.join(',') : ''))))];
  const body = `This is to inform that ${p.title} ${p.name}, ${ageOf(p) || '[age]'}-year-old ${p.sex === 'F' ? 'female' : 'male'} patient visited our hospital with the chief complaints of ${(p.complaint || '[complaint]').toLowerCase()}. On correlation of chief complaint with clinical examination, patient was diagnosed with ${dx} which ${dx.includes(',') ? 'were' : 'was'} causing the issue. ${tx.length ? cap(tx.join(' and ')) : '[Treatment]'} ${tx.length > 1 ? 'were' : 'was'} done to relieve the pain.`;
  return { body, lines: lines.length ? lines : [{ name: 'Consultation', amount: 200 }] };
}
