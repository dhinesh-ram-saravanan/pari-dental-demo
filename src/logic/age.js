// Age in whole years from the date of birth; falls back to the typed age when there is no DOB.
export function ageOf(p, now = new Date()) {
  if (!p.dob) return p.age ?? '';
  const b = new Date(p.dob + 'T00:00:00');
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}
