// Full UAT journeys: patient → reception → doctor → reception, plus calendar, registers, inventory, overview and two tabs.
import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { fresh, setRole, axe, sign, toast } from './helpers.js';

const row = (page, name) => page.getByTestId('today-list').locator('li', { hasText: name });
const bar = (page) => page.getByTestId('doctor-bar');

test.describe('1 · Patient: QR form on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('empty submit shows errors, a bad mobile is blocked, a valid form gets a token', async ({ page }) => {
    await fresh(page, '/#/form');
    await page.getByRole('button', { name: 'Submit' }).click();
    for (const msg of ['Enter the full name', 'Choose one', 'Enter age or date of birth', 'Enter the address', 'Enter the mobile number', 'What brings you in?', 'Please tap “I agree”', 'Please sign'])
      await expect(page.getByText(msg, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeInViewport(); // scrolled to the first error

    await page.getByLabel('Full name').fill('Anbu Selvan');
    await page.getByRole('radio', { name: 'Male', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pregnant' })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Female', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pregnant' })).toBeVisible();
    await page.getByRole('radio', { name: 'Male', exact: true }).click();
    await page.getByLabel('Age').fill('34');
    await page.getByLabel('Address').fill('12, Main Road, Selaiyur');
    const mobile = page.getByLabel('Mobile number');
    await mobile.pressSequentially('12a34-5');
    await expect(mobile).toHaveValue('12345'); // non-digits stripped as you type
    await page.getByLabel('Your main complaint').fill('Tooth pain, lower left');
    await page.getByRole('button', { name: 'Diabetes' }).click();
    await page.getByRole('button', { name: 'I agree' }).click();
    await sign(page);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Must be 10 digits starting with 6, 7, 8 or 9')).toBeVisible();
    await expect(page.getByTestId('token')).toHaveCount(0);

    await mobile.fill('9876543210');
    await axe(page);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('token')).toHaveText('8');
    await expect(page.getByText('Please take a seat, Anbu')).toBeVisible();
    await page.screenshot({ path: 'screenshots/phone-token.png' });

    // It is in reception's queue straight away, flagged as a new form.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/front-desk');
    await expect(row(page, 'Anbu Selvan')).toContainText('New form');
    await expect(row(page, 'Anbu Selvan')).toContainText('Diabetes');
  });
});

test.describe.serial('2–4 · One visit, start to finish', () => {
  let page;
  test.beforeAll(async ({ browser }) => { page = await (await browser.newContext()).newPage(); await fresh(page); });
  test.afterAll(() => page.context().close());

  test('2 · Reception: check in, returning patient, new form, send in', async () => {
    await row(page, 'Divya Subramanian').getByRole('button', { name: 'Check in' }).click();
    await expect(row(page, 'Divya Subramanian')).toHaveAttribute('data-status', 'waiting');

    await page.getByLabel('Find a patient').fill('Ganesh');
    await page.getByTestId('search-results').getByRole('button', { name: 'Add to today' }).click();
    await expect(toast(page)).toContainText('Ganesh Kumar added to the queue');
    await expect(row(page, 'Ganesh Kumar')).toHaveAttribute('data-status', 'waiting');

    await row(page, 'Saranya Devi').getByRole('button', { name: 'Check form' }).click();
    await expect(page.getByRole('heading', { name: 'Check patient form' })).toBeVisible();
    await page.getByRole('radio', { name: 'Orthodontics' }).click();
    await page.getByRole('radio', { name: 'General' }).click();
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(row(page, 'Saranya Devi')).not.toContainText('New form');

    // Only one patient can be with the doctor.
    await row(page, 'Saranya Devi').getByRole('button', { name: /More actions/ }).click();
    await page.getByRole('menuitem', { name: 'Send in now' }).click();
    await expect(toast(page)).toContainText('The doctor is still with Lakshmi Ramesh');
    await expect(bar(page)).toContainText('With the doctor: Lakshmi Ramesh');
    await axe(page);
  });

  test('3 · Doctor: chart a tooth, record treatments, hand over', async () => {
    await setRole(page, 'Doctor');
    await expect(page.getByRole('heading', { name: 'Mrs. Lakshmi Ramesh' })).toBeVisible();
    await page.getByRole('button', { name: 'Tooth 24', exact: true }).click();
    await page.getByRole('button', { name: 'Decay' }).click();
    await expect(page.getByRole('button', { name: 'Tooth 24, Decay' })).toBeVisible();

    await expect(page.getByLabel('Treatment 1', { exact: true })).toContainText('Consultation'); // next planned item is prefilled
    await expect(page.getByLabel('Price for treatment 1 (optional)')).toHaveValue('200');
    await page.getByRole('button', { name: '+ Add treatment' }).click();
    await page.getByLabel('Treatment 2', { exact: true }).selectOption({ label: 'Composite filling · ₹1,200' });
    await page.getByLabel('Teeth for treatment 2').fill('25');
    await page.getByLabel('Price for treatment 2 (optional)').fill(''); // blank: reception enters it
    await page.getByLabel('Remarks (optional)').fill('Sensitive to cold');
    await page.getByRole('button', { name: '1 week' }).click();
    await page.getByText('Prescription', { exact: true }).click();
    await page.getByRole('button', { name: '+ Sensitivity toothpaste' }).click();
    await expect(page.locator('.savebar')).toContainText('1 price for reception');
    await axe(page);
    await page.screenshot({ path: 'screenshots/desktop-doctor-recording.png', fullPage: true });
    await page.getByRole('button', { name: 'Hand over to reception' }).click();
    await expect(toast(page)).toContainText('Lakshmi Ramesh handed over to reception');
    await expect(page.getByTestId('chair-status')).toContainText('Chair free');
    await page.getByRole('button', { name: /Saranya Devi/ }).click(); // expands her sheet inline
    await expect(page.locator('.rowsheet')).toContainText('Pain in lower right back tooth');
    await page.screenshot({ path: 'screenshots/desktop-doctor-idle.png', fullPage: true });
    await axe(page);
  });

  test('4 · Reception: send in, checkout with a part payment, book the next visit; doctor sees the approval', async () => {
    await setRole(page, 'Reception');
    await expect(bar(page)).toContainText('Doctor is free');
    await bar(page).getByRole('button', { name: 'Send in' }).click();
    await expect(bar(page)).toContainText('With the doctor: Saranya Devi');

    await row(page, 'Lakshmi Ramesh').getByRole('button', { name: 'Checkout' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lakshmi Ramesh · checkout' });
    await expect(sheet).toContainText('enter price');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page)).toContainText('Enter the price for every treatment');
    await sheet.getByLabel('Price for Composite filling').fill('1000'); // list price is 1,200 → approval
    await expect(sheet.getByTestId('total-due')).toHaveText('₹1,200');
    await sheet.getByLabel('Amount received').fill('500');
    await sheet.getByRole('button', { name: 'Cash' }).click();
    await expect(sheet.getByTestId('carried')).toHaveText('₹700');
    await expect(sheet).toContainText('in 1 week'); // the doctor's suggestion is shown
    await sheet.getByLabel('Time').selectOption('09:00');
    await expect(sheet.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/91\d{10}\?text=/);
    await expect(sheet.getByRole('button', { name: 'Dr. Narasimman' })).toHaveAttribute('aria-pressed', 'true');
    await axe(page);
    await page.screenshot({ path: 'screenshots/desktop-checkout.png' });
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page)).toContainText('Saved · Lakshmi Ramesh balance ₹700');
    await expect(sheet).toHaveCount(0);
    await page.getByRole('button', { name: /Show finished/ }).click();
    await expect(page.locator('li.fd', { hasText: 'Lakshmi Ramesh' })).toContainText('₹500 paid');

    // The treatment register filled itself in.
    await page.getByRole('button', { name: 'Patients' }).click();
    await page.getByRole('link', { name: 'Treatment register' }).click();
    const reg = page.locator('table.reg tr', { hasText: 'Lakshmi Ramesh' });
    await expect(reg).toContainText('Composite filling 25');
    await expect(reg).toContainText('₹500');
    await expect(reg).toContainText('₹700');
    await expect(reg.getByLabel('Remarks for Lakshmi Ramesh')).toHaveValue('Sensitive to cold');

    // The next visit is in the calendar.
    await page.getByRole('link', { name: 'Calendar' }).click();
    await page.locator('.wkarr[aria-label="Next week"]').click();
    await expect(page.getByTestId('bookings')).toContainText('Lakshmi Ramesh');

    // The doctor is asked about the changed price.
    await setRole(page, 'Doctor');
    await page.getByRole('link', { name: 'Overview' }).click();
    const alert = page.locator('.notices li', { hasText: 'Composite filling' });
    await expect(alert).toContainText('Reception charged ₹1,000 for Composite filling (list ₹1,200)');
    await alert.getByRole('button', { name: 'Approve' }).click();
    await expect(toast(page)).toContainText('Composite filling is now ₹1,000');
    await expect(page.locator('.kpi', { hasText: 'Collected today' })).toContainText('₹1,300');
  });
});

test('5 · Calendar: mark called → Called list → Book clears it', async ({ page }) => {
  await fresh(page, '/#/calendar');
  const toCall = page.getByTestId('to-call'), called = page.getByTestId('called');
  const first = toCall.locator('li').first(), name = await first.locator('b').first().innerText();
  await first.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Mark as called' }).click();
  await expect(toast(page)).toContainText('Called, not booked yet');
  await expect(toCall).not.toContainText(name);
  const moved = called.locator('li', { hasText: name });
  await expect(moved).toContainText('called');
  await moved.getByRole('button', { name: 'Book' }).click();
  const dlg = page.getByRole('dialog', { name: 'Book appointment' });
  await dlg.getByLabel('Date').fill('2020-01-01');
  await dlg.getByRole('button', { name: 'Book' }).click();
  await expect(dlg).toContainText('Choose today or a later date'); // the past is blocked
  const day = new Date(Date.now() + 5 * 864e5).toLocaleDateString('en-CA');
  await dlg.getByLabel('Date').fill(day);
  await dlg.getByLabel('Time').selectOption('09:00');
  await axe(page);
  await dlg.getByRole('button', { name: 'Book' }).click();
  await expect(toast(page)).toContainText(`Booked ${name} at 09:00`);
  await expect(called).not.toContainText(name);
  await expect(toCall).not.toContainText(name);
  await expect(page.getByTestId('bookings')).toContainText(name);

  // Double booking the same slot is blocked.
  await page.getByRole('button', { name: '+ Book appointment' }).click();
  await dlg.getByLabel('Patient').selectOption({ index: 3 });
  await dlg.getByLabel('Date').fill(day);
  await dlg.getByLabel('Time').selectOption('09:00');
  await dlg.getByRole('button', { name: 'Book' }).click();
  await expect(toast(page)).toContainText('is already booked');
});

test('6 · Registers: import the sample Excel, check the preview, export and re-read', async ({ page }, info) => {
  await fresh(page, '/#/patients/info');
  await page.getByTestId('import-file').setInputFiles('reference/sample-old-patient-records.xlsx');
  const sum = page.getByTestId('import-summary');
  await expect(sum).toContainText('6 rows found');
  await expect(sum).toContainText('4 new');
  await expect(sum).toContainText('2 skipped');
  await expect(page.getByRole('dialog')).toContainText('landline, saved as office phone');
  await axe(page);
  await page.screenshot({ path: 'screenshots/desktop-import-preview.png' });
  await page.getByRole('button', { name: 'Import 4 records' }).click();
  await expect(toast(page)).toContainText('Imported 4 new and updated 0 patients');
  await expect(page.getByTestId('preg-summary')).toContainText('4 imported from Excel');
  await page.getByLabel('Source').selectOption('imp');
  await expect(page.locator('table.xl tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: /Sort by Reg No\./ }).click();
  await expect(page.locator('table.xl tbody tr').first()).toContainText('5826');
  await expect(page.locator('table.xl tbody tr').first()).toContainText('Scaling');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Excel' }).click()]);
  const file = info.outputPath(dl.suggestedFilename());
  await dl.saveAs(file);
  const wb = XLSX.read(readFileSync(file)), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  expect(Object.keys(rows[0])).toEqual(['Reg No.', 'Date', 'Name', 'Treatment', 'Mobile Number', 'Address', 'Age', 'Sex', 'DOB']);
  expect(rows).toHaveLength(43);
  expect(rows[0]).toMatchObject({ 'Reg No.': 5826, Date: '10/12/2025', Name: 'Ramya S', DOB: '12/05/1996' });

  // The imported patient has a record with the legacy visit; the register sorts both ways.
  await page.getByRole('link', { name: 'Ramya S' }).click();
  await expect(page.locator('table.sheet')).toContainText('Scaling');
  await page.goto('/#/patients/treatment');
  const sort = page.getByRole('button', { name: /Sort by Patient name/ });
  await sort.click(); await expect(sort).toHaveAccessibleName(/ascending/);
  const names = await page.locator('table.reg tbody tr td:nth-child(3)').allInnerTexts();
  expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  await sort.click(); await expect(sort).toHaveAccessibleName(/descending/);
  await page.getByRole('combobox', { name: 'Payment' }).selectOption('owes');
  await expect(page.getByTestId('treg-summary')).toContainText('Owed');
});

test('7 · Inventory: stock in creates an expense; record use warns on low stock', async ({ page }) => {
  await fresh(page, '/#/inventory');
  await expect(page.getByTestId('inv-attention')).toContainText('4 low on stock, 1 expiring within 30 days, 1 expired');
  await page.getByRole('button', { name: '+ Stock in' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Item name').fill('Cotton rolls');
  await dlg.getByLabel('Quantity').fill('0');
  await dlg.getByLabel('Total cost').fill('450');
  await dlg.getByLabel('Alert me when stock falls below').fill('3');
  await dlg.getByRole('button', { name: 'Add stock' }).click();
  await expect(toast(page)).toContainText('Quantity must be a whole number above 0');
  await dlg.getByLabel('Quantity').fill('10');
  await axe(page);
  await dlg.getByRole('button', { name: 'Add stock' }).click();
  await expect(toast(page)).toContainText('₹450 added to expenses');
  await expect(page.locator('table.tbl tr', { hasText: 'Cotton rolls' })).toContainText('OK');

  await page.getByRole('button', { name: 'Gutta-percha points' }).click();
  await expect(page.getByRole('dialog', { name: 'Gutta-percha points' })).toContainText('Batches');
  await page.getByRole('button', { name: 'Record use' }).click();
  await page.getByLabel('Quantity used').fill('2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toContainText('Low stock: Gutta-percha points is down to 2');
  await expect(page.locator('table.tbl tr', { hasText: 'Gutta-percha' })).toContainText('Low stock');

  await setRole(page, 'Doctor');
  await page.getByRole('link', { name: 'Clinic' }).click();
  await page.getByRole('radio', { name: 'Expenses' }).click();
  await expect(page.locator('.li', { hasText: 'Cotton rolls × 10' })).toContainText('₹450');
});

test('8 · Overview: a KPI tile opens its log; dismiss and restore a notice', async ({ page }) => {
  await fresh(page, '/#/overview', 'doctor');
  await page.getByRole('button', { name: /Pending dues/ }).click();
  const log = page.getByRole('dialog', { name: /Pending dues/ });
  await expect(log.locator('tbody tr')).toHaveCount(16);
  await axe(page);
  await log.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /Patients today/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Lakshmi Ramesh');
  await page.keyboard.press('Escape');

  const alerts = page.getByRole('region', { name: 'Alerts' }), stock = alerts.locator('li', { hasText: 'Stock:' });
  await stock.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Dismiss' }).click();
  await expect(stock).toHaveCount(0);
  await alerts.getByRole('button', { name: 'Show 1 hidden' }).click();
  await expect(stock).toHaveCount(1);
  await stock.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Remind me tomorrow' }).click();
  await expect(stock).toHaveCount(0);
});

test('9 · Two tabs: reception and doctor stay in sync', async ({ context, page: reception }) => {
  await fresh(reception);
  const doctor = await context.newPage();
  await doctor.addInitScript(() => { window.print = () => {}; });
  await doctor.goto('/#/doctor'); // opening on the doctor page starts the tab in the doctor role
  await expect(doctor.getByRole('heading', { name: 'Mrs. Lakshmi Ramesh' })).toBeVisible();
  await doctor.getByRole('button', { name: 'Hand over to reception' }).click();
  await expect(doctor.getByTestId('chair-status')).toContainText('Chair free');

  await expect(bar(reception)).toContainText('Doctor is free'); // reception tab updated by itself
  await expect(row(reception, 'Lakshmi Ramesh')).toHaveAttribute('data-status', 'checkout');
  await bar(reception).getByRole('button', { name: 'Send in' }).click();

  await expect(doctor.getByRole('heading', { name: 'Mrs. Saranya Devi' })).toBeVisible(); // doctor tab updated by itself
  await expect(doctor.getByTestId('in-chair')).toContainText('token 5');
});

test('Reports: letter fills from the record, edits show in the A4 preview', async ({ page }) => {
  await fresh(page, '/#/reports/new', 'doctor');
  await page.getByLabel('Patient').selectOption({ label: 'Mohammed Irfan · 6016' });
  const preview = page.getByTestId('report-preview');
  await expect(preview).toContainText('DENTAL TREATMENT REPORT');
  await expect(preview).toContainText('Mr. Mohammed Irfan');
  await page.getByLabel('Amount 1').fill('950');
  await expect(preview).toContainText('- Rs 950');
  await page.screenshot({ path: 'screenshots/desktop-report-editor.png', fullPage: true });
  await axe(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.li', { hasText: 'Mohammed Irfan' }).first()).toBeVisible();
});

test('Patient record: collect a payment for dues', async ({ page }) => {
  await fresh(page, '/#/patients/p4');
  const before = await page.getByTestId('balance').innerText();
  await page.getByLabel('Amount to collect').fill('500');
  await page.getByRole('button', { name: 'Collect' }).click();
  await expect(toast(page)).toContainText('₹500 collected from Karthik Raja');
  await expect(page.getByTestId('balance')).not.toHaveText(before);
  await page.getByRole('button', { name: 'Print' }).click(); // A4 paper form, front and back
  await expect(page.locator('#print .pg')).toHaveCount(2);
});
