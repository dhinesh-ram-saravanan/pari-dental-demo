import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// Fresh seed for every test: clear storage before the app boots.
export async function fresh(page, path = '/#/front-desk', role) {
  await page.addInitScript((r) => {
    if (!sessionStorage.getItem('e2e.init')) { localStorage.clear(); sessionStorage.setItem('e2e.init', '1'); if (r) sessionStorage.setItem('pariDental.role', r); }
    window.print = () => {};
  }, role);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no colour transitions mid-check
  await page.goto(path);
  await expect(page.locator('#main')).toBeVisible();
}

export async function setRole(page, role) {
  await page.getByRole('group', { name: 'Role' }).getByRole('button', { name: role }).click();
}

export async function axe(page) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0].target} — ${v.nodes[0].failureSummary?.split('\n')[1]?.trim()}`)).toEqual([]);
}

export async function sign(page) {
  const c = page.getByRole('img', { name: 'Signature pad' });
  await c.scrollIntoViewIfNeeded();
  const b = await c.boundingBox();
  await page.mouse.move(b.x + 30, b.y + 60); await page.mouse.down();
  await page.mouse.move(b.x + 90, b.y + 30, { steps: 4 }); await page.mouse.move(b.x + 150, b.y + 80, { steps: 4 }); await page.mouse.up();
}

export const toast = (page) => page.locator('#toast');
