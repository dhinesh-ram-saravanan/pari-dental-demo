// Screenshots of every page at desktop and tablet (and the QR form on a phone), each checked with axe.
import { test } from '@playwright/test';
import { fresh, axe } from './helpers.js';

const PAGES = [
  ['front-desk', '/#/front-desk', 'reception'], ['calendar', '/#/calendar', 'reception'], ['register', '/#/register', 'reception'],
  ['doctor-consult', '/#/doctor', 'doctor'], ['overview', '/#/overview', 'doctor'], ['treatment-register', '/#/patients/treatment', 'reception'],
  ['patient-info', '/#/patients/info', 'reception'], ['patient-record', '/#/patients/p1', 'reception'], ['inventory', '/#/inventory', 'reception'],
  ['reports', '/#/reports', 'doctor'], ['report-edit', '/#/reports/new', 'doctor'], ['team', '/#/team', 'reception'], ['clinic', '/#/clinic', 'doctor'], ['tablet', '/#/tablet', 'reception'],
];
const SIZES = { desktop: { width: 1440, height: 900 }, tablet: { width: 1180, height: 820 } };

for (const [size, viewport] of Object.entries(SIZES)) {
  test.describe(size, () => {
    test.use({ viewport });
    for (const [name, path, role] of PAGES) {
      test(`${name} @ ${size}`, async ({ page }) => {
        await fresh(page, path, role);
        await page.screenshot({ path: `screenshots/${size}-${name}.png`, fullPage: true });
        await axe(page);
      });
    }
  });
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('qr form @ phone', async ({ page }) => {
    await fresh(page, '/#/form');
    await page.screenshot({ path: 'screenshots/phone-form.png', fullPage: true });
    await axe(page);
  });
});
