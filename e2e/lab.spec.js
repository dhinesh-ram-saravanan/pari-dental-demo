// Lab work (crowns, dentures…): measurement taken → waiting for the supplier → arrived → fitted.
import { test, expect } from '@playwright/test';
import { fresh, setRole, axe, sign, toast } from './helpers.js';

const row = (page, name) => page.getByTestId('today-list').locator('li', { hasText: name });
const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('en-CA');

test('lab work from measurement to fitting, across doctor and reception', async ({ page }) => {
  await fresh(page, '/#/lab');
  const waiting = page.getByTestId('lab-waiting'), arrived = page.getByTestId('lab-arrived');
  await expect(waiting.locator('li')).toHaveCount(2);
  await expect(arrived.locator('li')).toHaveCount(1);
  await expect(waiting).toContainText('Overdue');
  await axe(page);
  await page.screenshot({ path: 'screenshots/desktop-lab.png', fullPage: true });

  // Reception notes the supplier's charge; it becomes a Lab expense.
  await waiting.locator('li').first().getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Supplier, date and charge' }).click();
  await page.getByLabel('Supplier’s charge (₹)').fill('1800');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toContainText('Lab details saved');

  // 1 · Doctor records the measurement.
  await setRole(page, 'Doctor');
  await page.getByRole('link', { name: 'Today' }).click();
  await page.getByRole('button', { name: '+ Add treatment' }).click();
  await page.getByLabel('Treatment 2', { exact: true }).selectOption({ label: 'Zirconia crown · ₹10,000' });
  await expect(page.getByLabel('Step for treatment 2')).toHaveValue('measure'); // lab-made work starts with the measurement
  await page.getByLabel('Teeth for treatment 2').fill('36');
  await expect(page.getByText('Reception calls the patient when it arrives')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Ongoing' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '+ Add treatment' }).click();
  await page.getByLabel('Treatment 3', { exact: true }).selectOption({ label: 'Scaling & polishing · ₹1,200' });
  await page.getByLabel('Step for treatment 3').selectOption('later'); // planned, not charged today
  await expect(page.locator('.savebar')).toContainText('1 planned for later');
  await axe(page);
  await page.screenshot({ path: 'screenshots/desktop-doctor-lab.png', fullPage: true });
  await page.getByRole('button', { name: 'Hand over to reception' }).click();
  await expect(toast(page)).toContainText('handed over');

  // 2 · Reception checks out; the crown is charged now and paid in part.
  await setRole(page, 'Reception');
  await row(page, 'Lakshmi Ramesh').getByRole('button', { name: 'Checkout' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('measurement taken');
  await expect(sheet).toContainText('Lab work has gone to the supplier');
  await expect(sheet).not.toContainText('Scaling');
  await expect(sheet.getByTestId('total-due')).toHaveText('₹10,200');
  await sheet.getByLabel('Amount received').fill('4000');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toContainText('balance ₹6,200');

  // 3 · It waits with the supplier; when it comes, reception marks it and books the fitting.
  await page.getByRole('link', { name: /Lab work/ }).click();
  const mine = page.locator('li.fd', { hasText: 'Lakshmi Ramesh' });
  await expect(mine).toHaveAttribute('data-lab', 'waiting');
  await expect(mine).toContainText('Zirconia crown 36');
  await mine.getByRole('button', { name: 'Mark as arrived' }).click();
  await expect(mine).toHaveAttribute('data-lab', 'arrived');
  await mine.getByRole('button', { name: /More actions/ }).click();
  await expect(page.getByRole('menuitem', { name: 'WhatsApp' })).toHaveAttribute('href', /has%20arrived/);
  await page.keyboard.press('Escape');
  await mine.getByRole('button', { name: 'Book fitting' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByLabel('Reason')).toHaveValue('Zirconia crown 36 fitting');
  await dlg.getByLabel('Date').fill(tomorrow);
  await dlg.getByRole('button', { name: 'Book' }).click();
  await expect(mine).toContainText('Fitting');
  await expect(mine.getByRole('button', { name: 'Book fitting' })).toHaveCount(0);

  // 4 · The patient comes back; the doctor's screen is ready for the fitting.
  await page.getByRole('link', { name: 'Front desk' }).click();
  await page.getByLabel('Find a patient').fill('Lakshmi');
  await page.getByTestId('search-results').getByRole('button', { name: 'Add to today' }).click();
  await row(page, 'Lakshmi Ramesh').getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Send in now' }).click();
  await setRole(page, 'Doctor');
  await expect(page.locator('.labnote.in')).toContainText('Zirconia crown 36 has arrived from the supplier');
  await expect(page.getByLabel('Treatment 1', { exact: true })).toContainText('Zirconia crown');
  await expect(page.getByLabel('Step for treatment 1')).toHaveValue('fit');
  await expect(page.getByLabel('Price for treatment 1 (optional)')).toHaveValue('0'); // already charged at the measurement
  await expect(page.getByText('Still planned')).toContainText('Scaling & polishing'); // the plan made last time
  await page.getByRole('button', { name: 'Hand over to reception' }).click();
  await expect(page.getByRole('button', { name: 'Tooth 36, Crown' })).toHaveCount(0); // chair is free now
  await page.getByRole('link', { name: /Lab work/ }).click();
  await page.getByRole('button', { name: /Show fitted \(1\)/ }).click();
  await expect(page.locator('li.fd[data-lab=fitted]')).toContainText('Lakshmi Ramesh');
  await page.goto('/#/patients/p1');
  await page.getByText('Tooth chart and treatment plans').click();
  await expect(page.locator('.tooth[title="Tooth 36, Crown"]')).toBeVisible();

  // The supplier's charge is in this month's expenses; Zirconia crown is flagged as lab work in the price list.
  await page.getByRole('link', { name: 'Clinic' }).click();
  await expect(page.locator('.li', { hasText: 'Zirconia crown' }).getByRole('button', { name: 'Lab work' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('radio', { name: 'Expenses' }).click();
  await expect(page.locator('.li', { hasText: '· lab work' })).toContainText('₹1,800');
});

test('reception adds a lab item by hand', async ({ page }) => {
  await fresh(page, '/#/lab');
  await page.getByRole('button', { name: '+ Lab item' }).click();
  const dlg = page.getByRole('dialog', { name: 'Add a lab item' });
  await dlg.getByRole('button', { name: 'Add to lab work' }).click();
  await expect(dlg.getByText('Choose the patient')).toBeVisible();
  await dlg.getByLabel('Find patient').fill('Fathima'); // one match picks her
  await expect(dlg.getByRole('combobox', { name: 'Patient' })).toHaveValue('p5');
  await dlg.getByLabel('What is being made').selectOption({ label: 'Complete denture' });
  await dlg.getByLabel('Teeth').fill('99');
  await dlg.getByRole('button', { name: 'Add to lab work' }).click();
  await expect(dlg.getByText('“99” is not a tooth number')).toBeVisible();
  await dlg.getByLabel('Teeth').fill('');
  await expect(dlg.getByLabel('Supplier (lab)')).toHaveValue('Precision Dental Lab'); // last supplier used
  await axe(page);
  await dlg.getByRole('button', { name: 'Add to lab work' }).click();
  await expect(toast(page)).toContainText('Complete denture added for Fathima Begum');
  const mine = page.getByTestId('lab-waiting').locator('li', { hasText: 'Fathima Begum' });
  await expect(mine).toContainText('Complete denture');
  await expect(mine).toContainText('added at the desk');
  await mine.getByRole('button', { name: 'Mark as arrived' }).click();
  await expect(page.getByTestId('lab-arrived').locator('li', { hasText: 'Fathima Begum' }).getByRole('button', { name: 'Book fitting' })).toBeVisible();
});

test('mistakes can be undone: the doctor takes a visit back, reception reopens a checkout', async ({ page }) => {
  await fresh(page, '/#/doctor', 'doctor');
  await page.getByLabel('Remarks for the register (optional)').fill('first try');
  await page.getByRole('button', { name: 'Hand over to reception' }).click();
  await page.locator('p', { hasText: 'Lakshmi Ramesh' }).getByRole('button', { name: 'Take back to correct' }).click();
  await expect(toast(page)).toContainText('back in your chair');
  await expect(page.getByLabel('Remarks for the register (optional)')).toHaveValue('first try');
  await expect(page.getByLabel('Treatment 1', { exact: true })).toContainText('Consultation');
  await page.getByRole('radio', { name: 'Milk teeth' }).click(); // child chart
  await expect(page.getByRole('button', { name: 'Tooth 55', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tooth 18', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hand over to reception' }).click();

  await setRole(page, 'Reception');
  await row(page, 'Lakshmi Ramesh').getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('dialog').getByLabel('Amount received').fill('200');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /Show finished/ }).click();
  const done = page.locator('li.fd[data-status=done]', { hasText: 'Lakshmi Ramesh' });
  page.once('dialog', (d) => d.accept());
  await done.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Reopen checkout to correct it' }).click();
  await expect(row(page, 'Lakshmi Ramesh')).toHaveAttribute('data-status', 'checkout');

  // Calendar: earlier days can be opened; a typed name works as a signature.
  await page.getByRole('link', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  await page.goto('/#/register');
  await page.getByLabel('Full name').fill('Mala Devi'); await page.getByRole('radio', { name: 'Female', exact: true }).click();
  await page.getByLabel('Age').fill('44'); await page.getByLabel('Address').fill('9, Nehru Street, Tambaram'); await page.getByLabel('Mobile number').fill('9840022331');
  await page.getByLabel('Your main complaint').fill('Loose tooth'); await page.getByRole('button', { name: 'I agree' }).click();
  await page.getByLabel('Cannot draw? Type your name here to sign').fill('Mala Devi');
  await page.getByRole('button', { name: 'Register and add to today' }).click();
  await expect(row(page, 'Mala Devi')).toBeVisible();
});

test('a form filled on the patient’s own phone reaches the desk through a WhatsApp link', async ({ browser }) => {
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await fresh(phone, '/#/form');
  await phone.getByLabel('Full name').fill('Anbu Selvan'); await phone.getByRole('radio', { name: 'Male', exact: true }).click();
  await phone.getByLabel('Age').fill('34'); await phone.getByLabel('Address').fill('12, Main Road, Selaiyur'); await phone.getByLabel('Mobile number').fill('9876543210');
  await phone.getByLabel('Allergic to any medicines? (specify)').fill('Penicillin');
  await phone.getByRole('button', { name: 'Tooth pain', exact: true }).click(); await phone.getByRole('button', { name: 'I agree' }).click();
  await sign(phone);
  await phone.getByRole('button', { name: 'Submit' }).click();
  const wa = phone.getByRole('link', { name: 'Send my form on WhatsApp' });
  await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/918687888934\?text=/);
  const link = decodeURIComponent((await wa.getAttribute('href')).split('text=')[1]).split(': ')[1];
  await phone.context().close();

  // The desk PC is a different device with its own data.
  const desk = await (await browser.newContext()).newPage();
  await fresh(desk, new URL(link).pathname + new URL(link).hash);
  await expect(desk.getByRole('heading', { name: 'Mr. Anbu Selvan' })).toBeVisible();
  await expect(desk.locator('.sheetcard')).toContainText('Penicillin');
  await desk.getByRole('button', { name: 'Add Anbu Selvan to today’s queue' }).click();
  await expect(desk.getByTestId('today-list').locator('li', { hasText: 'Anbu Selvan' })).toContainText('New form');
  await desk.goto('/#/form-in/garbage');
  await expect(desk.locator('.warnline')).toContainText('damaged');
  await desk.context().close();
});
