// Checks from the full audit: small screens, keyboard, drafts, safety prompts, autofill and print.
import { test, expect } from '@playwright/test';
import { fresh, setRole, toast } from './helpers.js';

const STAFF = [['/#/front-desk', 'reception'], ['/#/calendar', 'reception'], ['/#/register', 'reception'], ['/#/patients/treatment', 'reception'], ['/#/patients/info', 'reception'], ['/#/patients/p1', 'reception'], ['/#/inventory', 'reception'], ['/#/lab', 'reception'], ['/#/team', 'reception'], ['/#/reports', 'doctor'], ['/#/reports/new', 'doctor'], ['/#/doctor', 'doctor'], ['/#/overview', 'doctor'], ['/#/clinic', 'doctor']];

for (const [w, h] of [[390, 844], [768, 1024]]) {
  test(`no sideways scrolling on any staff screen at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const [path, role] of STAFF) {
      await fresh(page, path, role);
      await page.evaluate((r) => sessionStorage.setItem('pariDental.role', r), role);
      await page.goto(path); await page.reload();
      await expect(page.locator('#main h1').first()).toBeVisible();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `${path} overflows by ${over}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `screenshots/w${w}-${path.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
    }
  });
}

test('dialogs take focus, keep Tab inside and give focus back; menus work with arrow keys', async ({ page }) => {
  await fresh(page);
  const btn = page.getByTestId('today-list').locator('li', { hasText: 'Karthik Raja' }).getByRole('button', { name: 'Checkout' });
  await btn.focus(); await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('Amount received')).toBeFocused();
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]'))).toBe(true); }
  await sheet.getByLabel('Amount received').fill('300'); // kept as a draft if the sheet is closed by mistake
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(btn).toBeFocused();
  await btn.click();
  await expect(page.getByRole('dialog').getByLabel('Amount received')).toHaveValue('300');
  await page.keyboard.press('Escape');

  const dots = page.getByRole('button', { name: 'More front desk actions' });
  await dots.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Patient tablet' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'QR code for the form' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dots).toBeFocused();
  await expect(page).toHaveTitle('Front desk · Pari Dental Hospital');
});

test('reception: search text carries into the new-patient form; title follows sex; queue mistakes can be undone', async ({ page }) => {
  await fresh(page);
  await page.getByLabel('Find a patient').fill('98845 61200'); // spaces in the number still find her
  await expect(page.getByTestId('search-results')).toContainText('Saranya Devi');
  await page.getByLabel('Find a patient').fill('Ravi Teja 9841077889');
  await page.getByRole('button', { name: /Register “Ravi Teja 9841077889”/ }).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Ravi Teja');
  await expect(page.getByLabel('Mobile number')).toHaveValue('9841077889');
  await page.getByRole('radio', { name: 'Female', exact: true }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Ms.');
  await page.getByRole('button', { name: 'Bleeding gums' }).click(); // common complaints as one-tap suggestions
  await expect(page.getByLabel('Your main complaint')).toHaveValue('Bleeding gums');
  await page.getByLabel('Age').fill('30'); await page.getByLabel('Address').fill('4, Camp Road, Selaiyur');
  await page.getByRole('button', { name: 'I agree' }).click();
  await page.getByRole('button', { name: 'Signed on the paper form instead' }).click(); // no mouse signature at the desk
  await page.getByRole('button', { name: 'Register and add to today' }).click();
  const row = page.getByTestId('today-list').locator('li', { hasText: 'Ravi Teja' });
  await expect(row).toHaveAttribute('data-status', 'waiting');
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Remove from today’s queue' }).click();
  await expect(row).toHaveCount(0);
  const chair = page.getByTestId('today-list').locator('li', { hasText: 'Lakshmi Ramesh' });
  await chair.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Move back to waiting' }).click();
  await expect(chair).toHaveAttribute('data-status', 'waiting');
  await expect(page.getByTestId('doctor-bar')).toContainText('Doctor is free');
});

test('doctor: the consultation survives a reload; allergy is flagged on prescriptions; planned treatment fills its teeth', async ({ page }) => {
  await fresh(page, '/#/doctor', 'doctor');
  await page.getByLabel('Remarks for the register (optional)').fill('Sensitive to cold');
  await page.getByRole('button', { name: '1 week' }).click();
  await expect(page.getByLabel('Clinical notes')).toHaveValue('Examined, advised.'); // from the chosen treatment
  await page.reload();
  await expect(page.getByLabel('Remarks for the register (optional)')).toHaveValue('Sensitive to cold');
  await expect(page.getByRole('button', { name: '1 week' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radio', { name: 'Ongoing' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: '+ Add treatment' }).click();
  await page.getByLabel('Treatment 2', { exact: true }).selectOption({ label: 'Composite filling · ₹1,200' });
  await expect(page.getByLabel('Teeth for treatment 2')).toHaveValue('25'); // from the open plan
  await expect(page.getByText('Still planned')).toHaveCount(0);

  await page.getByText('Prescription', { exact: true }).click();
  await expect(page.locator('.warnline', { hasText: 'Allergic to Penicillin' })).toBeVisible();
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.getByRole('button', { name: '+ Amoxicillin 500mg' }).click();
  expect(asked).toContain('allergic to Penicillin');
  await expect(page.getByLabel('Prescription')).toHaveValue('');
  await page.getByRole('button', { name: '+ Paracetamol 650mg' }).click();
  await expect(page.getByLabel('Prescription')).toHaveValue(/Paracetamol/);
  await page.getByRole('button', { name: 'Hand over to reception' }).click();
  await expect(toast(page)).toContainText('handed over');
  await setRole(page, 'Reception');
  await page.goto('/#/patients/p1');
  await page.getByText('Visits and prescriptions').click();
  await expect(page.locator('.tl')).toContainText('Examined, advised.');
});

test('print layouts: record is two A4 sheets, register is one landscape page, receipt and prescription fit one page', async ({ page }) => {
  let wide = 0; // how far the widest printed table sticks out of its page, in px
  const pages = async (name) => { await page.emulateMedia({ media: 'print' }); wide = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('#print table')].map((t) => t.scrollWidth - t.parentElement.clientWidth))); await page.screenshot({ path: `screenshots/print-${name}.png`, fullPage: true }); const pdf = await page.pdf({ path: `screenshots/print-${name}.pdf`, preferCSSPageSize: true, format: 'A4' }); await page.emulateMedia({ media: 'screen' }); return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; };
  await fresh(page, '/#/patients/p1');
  await page.getByRole('button', { name: 'Print' }).click();
  await expect(page.locator('#print .pg')).toHaveCount(2);
  expect(await pages('record')).toBe(2);

  await page.goto('/#/patients/treatment');
  await page.getByRole('button', { name: 'This month' }).click();
  await page.getByRole('button', { name: 'Print' }).click();
  await expect(page.locator('#print .rpage.wide')).toHaveCount(1);
  const reg = await pages('register');
  expect(reg).toBeGreaterThanOrEqual(1);
  expect(wide).toBeLessThanOrEqual(1);

  await page.goto('/#/front-desk');
  await page.getByRole('button', { name: /Show finished/ }).click();
  await page.locator('li.fd', { hasText: 'Mohammed Irfan' }).getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Print receipt' }).click();
  await expect(page.locator('#print')).toContainText('RECEIPT');
  await expect(page.locator('#print')).toContainText('₹800');
  expect(await pages('receipt')).toBe(1);

  await fresh(page, '/#/reports', 'doctor');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.locator('#print .rdoc')).toContainText('Dr. Narasimman');
  expect(await pages('report')).toBe(1);
});
