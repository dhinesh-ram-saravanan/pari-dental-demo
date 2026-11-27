// The rest of the app: form guards, tablet, bookings, record editing, doctor's settings.
import { test, expect } from '@playwright/test';
import { fresh, setRole, axe, sign, toast } from './helpers.js';

const row = (page, name) => page.getByTestId('today-list').locator('li', { hasText: name });

test.describe('Patient form guards', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('date is automatic, phone takes 10 digits only, email and date of birth are checked as you go', async ({ page }) => {
    await fresh(page, '/#/form');
    await expect(page.locator('.autodate')).toContainText('today, filled in for you');
    await expect(page.getByText('Staff: exit')).toHaveCount(0); // patients cannot reach staff screens
    await expect(page.locator('input[type=date]')).toHaveCount(0); // nothing to type a date into

    const mobile = page.getByLabel('Mobile number');
    await expect(mobile).toHaveAttribute('inputmode', 'numeric');
    await expect(mobile).toHaveAttribute('type', 'tel');
    await mobile.fill('+91 98765 43210'); // pasted with country code
    await expect(mobile).toHaveValue('9876543210');
    await mobile.fill('98765abc');
    await expect(mobile).toHaveValue('98765');
    await expect(page.getByText('5 of 10 digits')).toBeVisible();
    await mobile.blur();
    await expect(page.getByText('Must be 10 digits starting with 6, 7, 8 or 9')).toBeVisible(); // flagged before submit
    await mobile.fill('1234567890');
    await mobile.blur();
    await expect(page.getByText('Must be 10 digits starting with 6, 7, 8 or 9')).toBeVisible();
    await mobile.fill('9876543210');
    await expect(page.getByText('Must be 10 digits starting with 6, 7, 8 or 9')).toHaveCount(0);

    const email = page.getByLabel('Email');
    await email.fill('anbu@gmail'); await email.blur();
    await expect(page.getByText('Check the email')).toBeVisible();
    await email.fill('anbu@gmail.com');
    await expect(page.getByText('Check the email')).toHaveCount(0);

    const emerg = page.getByLabel('Emergency contact number');
    await emerg.fill('98400112'); await emerg.blur();
    await expect(page.getByText('10 digits', { exact: true })).toBeVisible();
    await emerg.fill('9840011223');
    await page.getByLabel('Office phone').fill('044-2222 3333 99');
    await expect(page.getByLabel('Office phone')).toHaveValue('04422223333');

    await page.getByLabel('Day of birth').selectOption('31');
    await page.getByLabel('Month of birth').selectOption({ label: 'February' });
    await page.getByLabel('Year of birth').selectOption('1990');
    await expect(page.getByText('That date does not exist')).toBeVisible();
    await page.getByLabel('Day of birth').selectOption('5');
    await expect(page.getByText('That date does not exist')).toHaveCount(0);
    const age = page.getByLabel('Age');
    await expect(age).toHaveAttribute('readonly', '');
    expect(+(await age.inputValue())).toBeGreaterThan(34); // worked out from the date of birth

    await page.getByLabel('Full name').fill('Anbu 123');
    await page.getByLabel('Full name').blur();
    await expect(page.getByText('Letters, spaces and dots only')).toBeVisible();
    await page.getByLabel('Full name').fill('Anbu Selvan');
    await page.getByRole('radio', { name: 'Male', exact: true }).click();
    await page.getByLabel('Address').fill('12, Main Road, Selaiyur');
    await page.getByLabel('Your main complaint').fill('Tooth pain');
    await page.getByRole('button', { name: 'I agree' }).click();
    await sign(page);
    await page.screenshot({ path: 'screenshots/phone-form-filled.png', fullPage: true });
    await axe(page);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Who is this?')).toBeVisible(); // emergency number needs a relation
    await page.getByLabel('Relation to patient').fill('Wife');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('token')).toHaveText('8');
    await expect(page.getByText('You can close this page now.')).toBeVisible();
  });
});

test('Tablet: a returning patient joins the queue with their mobile number', async ({ page }) => {
  await fresh(page, '/#/tablet');
  await page.getByRole('button', { name: 'I have visited before' }).click();
  await page.getByLabel('Mobile number').fill('12345');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(toast(page)).toContainText('Enter your 10-digit mobile number');
  await page.getByLabel('Mobile number').fill('9884561200'); // Saranya Devi, already waiting
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('token')).toHaveText('5'); // keeps her token, no duplicate
  await page.getByRole('button', { name: 'Next patient' }).click();
  await page.getByRole('button', { name: 'This is my first visit' }).click();
  await expect(page.getByRole('heading', { name: 'Patient form' })).toBeVisible();
  await axe(page);
  await page.getByRole('button', { name: 'Staff: exit tablet mode' }).click();
  await expect(page.getByRole('heading', { name: 'Front desk' })).toBeVisible();
  await expect(page.getByTestId('today-list').locator('li', { hasText: 'Saranya Devi' })).toHaveCount(1);
});

test('Reception: QR code, notices, bookings (new patient, reschedule, cancel) and editing a record', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'More front desk actions' }).click();
  await page.getByRole('menuitem', { name: 'QR code for the form' }).click();
  const qr = page.getByRole('dialog', { name: 'Scan to fill the patient form' });
  await expect(qr.getByRole('img', { name: 'QR code for the patient form' })).toBeVisible();
  await expect(qr.getByRole('link')).toHaveAttribute('href', /#\/form$/);
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(qr).toHaveCount(0);

  // Needs attention: 3 shown, the rest behind "Show all"; dismissed ones come back with "Show hidden".
  const notices = page.getByRole('region', { name: 'Needs attention' });
  await expect(notices.locator('li')).toHaveCount(3);
  await notices.getByRole('button', { name: /Show all/ }).click();
  expect(await notices.locator('li').count()).toBeGreaterThan(3);
  const dues = notices.locator('li', { hasText: 'Pending dues' });
  await dues.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Dismiss' }).click();
  await expect(dues).toHaveCount(0);
  await notices.getByRole('button', { name: 'Show 1 hidden' }).click();
  await expect(dues).toHaveCount(1);
  await dues.getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('combobox', { name: 'Payment' })).toHaveValue('owes'); // register, filtered to who owes
  await page.goBack();

  // Book a brand-new caller.
  await page.getByRole('button', { name: 'More front desk actions' }).click();
  await page.getByRole('menuitem', { name: 'Book an appointment' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Book' }).click();
  await expect(dlg).toContainText('Enter the name');
  await expect(dlg).toContainText('10 digits, starting 6 to 9');
  await dlg.getByLabel('Name').fill('Vimala R');
  await dlg.getByLabel('Mobile').fill('98410 55667');
  await expect(dlg.getByLabel('Mobile')).toHaveValue('9841055667');
  await dlg.getByLabel('Time').selectOption('09:30');
  await dlg.getByLabel('Reason').fill('Tooth pain');
  await dlg.getByRole('button', { name: 'Book' }).click();
  await expect(toast(page)).toContainText('Booked Vimala R at 09:30');

  // Move it, then cancel it.
  await page.getByRole('link', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: /^Sat|^Sun|^Mon|^Tue|^Wed|^Thu|^Fri/ }).first().click(); // tomorrow
  const booking = page.getByTestId('bookings').locator('li', { hasText: 'Vimala R' });
  await booking.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Reschedule' }).click();
  await page.getByRole('dialog', { name: 'Reschedule' }).getByLabel('Time').selectOption('20:30');
  await page.getByRole('button', { name: 'Move booking' }).click();
  await expect(toast(page)).toContainText('Moved to 20:30');
  await expect(booking).toContainText('20:30');
  page.once('dialog', (d) => d.accept());
  await booking.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Cancel booking' }).click();
  await expect(booking).toHaveCount(0);

  // Edit a patient's form from their record; the signature is not asked for again.
  await page.goto('/#/patients/p5');
  await page.getByRole('button', { name: 'Edit form' }).click();
  await page.getByLabel('Profession').fill('Tailor');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(toast(page)).toContainText('Patient details saved');
  await page.goto('/#/patients/p5');
  await expect(page.locator('.sheetcard')).toContainText('Tailor');
  await page.getByText('Tooth chart and treatment plans').click();
  await page.getByText('Visits and prescriptions').click();
  await axe(page);

  // Team: add someone; they show under "Handled by" at checkout.
  await page.getByRole('link', { name: 'Team' }).click();
  await page.getByPlaceholder('Name, e.g. Dr. Keerthana').fill('Dr. Keerthana');
  await page.getByRole('button', { name: 'Add to team' }).click();
  await page.getByRole('link', { name: 'Front desk' }).click();
  await row(page, 'Karthik Raja').getByRole('button', { name: 'Checkout' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Dr. Keerthana (junior)' }).click();
  await sheet.getByRole('button', { name: '+ Add' }).click();
  await sheet.getByLabel('New team member name').fill('Dr. Arun');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Dr. Arun (junior)' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Nothing today' }).click();
  await sheet.getByRole('button', { name: 'Remind later' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toContainText('Saved · Karthik Raja');
  await page.getByRole('link', { name: 'Team' }).click();
  await expect(page.locator('tr', { hasText: 'Dr. Arun' }).locator('td.num')).toHaveText('1'); // patients handled
});

test('Doctor: tooth numbers are checked, a typed treatment is saved, clinic settings and reset work', async ({ page }) => {
  await fresh(page, '/#/doctor', 'doctor');
  await page.getByLabel('Teeth for treatment 1').fill('99');
  await page.getByRole('button', { name: 'Hand over to reception' }).click();
  await expect(toast(page)).toContainText('“99” is not a tooth number');
  await page.getByLabel('Teeth for treatment 1').fill('');
  await page.getByRole('button', { name: 'Tooth 36', exact: true }).click();
  await page.getByRole('button', { name: '+ Add treatment' }).click(); // selected tooth goes to the new row
  await expect(page.getByLabel('Teeth for treatment 2')).toHaveValue('36');
  await page.getByLabel('Treatment 2', { exact: true }).selectOption('other');
  await page.getByLabel('Treatment 2 name').fill('Desensitising varnish');
  await page.getByLabel('Price for treatment 2 (optional)').fill('300');
  await page.getByRole('button', { name: 'Record sheet' }).click();
  await expect(page.getByRole('dialog', { name: 'Mrs. Lakshmi Ramesh' })).toContainText('Treatment plan');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Hand over to reception' }).click();
  await expect(toast(page)).toContainText('handed over to reception');

  await page.getByRole('link', { name: 'Clinic' }).click();
  await expect(page.locator('.li', { hasText: 'Desensitising varnish' })).toContainText('added in treatment');
  await page.getByLabel('New service name').fill('Night guard');
  await page.getByLabel('Price', { exact: true }).fill('2500');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.li', { hasText: 'Night guard' })).toBeVisible();
  await page.getByRole('switch', { name: 'Night guard is offered' }).click();
  await expect(toast(page)).toContainText('Night guard is hidden from the list');
  await axe(page);

  await page.getByRole('radio', { name: /Approvals/ }).click();
  await page.getByRole('button', { name: 'Keep ₹1,200' }).click();
  await expect(page.getByText('Nothing to approve.')).toBeVisible();
  await expect(page.locator('.row-item', { hasText: 'Scaling & polishing' })).toContainText('Kept old');

  await page.getByRole('radio', { name: 'Expenses' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(toast(page)).toContainText('Enter the item and an amount above 0');
  await page.getByLabel('Item').fill('Autoclave service');
  await page.getByLabel('Amount').fill('1800');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.li', { hasText: 'Autoclave service' })).toContainText('₹1,800');

  await page.getByRole('radio', { name: 'Team' }).click();
  await expect(page.locator('tr', { hasText: 'Dr. Narasimman' })).toBeVisible();
  await page.getByRole('radio', { name: 'Settings' }).click();
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('044 2222 3333');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(toast(page)).toContainText('Saved');
  await axe(page);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page.getByRole('heading', { name: 'Mrs. Lakshmi Ramesh' })).toBeVisible(); // back to the sample day
  await page.getByRole('link', { name: 'Clinic' }).click();
  await expect(page.locator('.li', { hasText: 'Night guard' })).toHaveCount(0);

  // Role switch keeps each role's menu.
  await setRole(page, 'Reception');
  await expect(page.getByRole('link', { name: 'Clinic' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Team' })).toBeVisible();
});

test('Reports: draw and save the doctor’s signature, reuse it on the next report', async ({ page }) => {
  await fresh(page, '/#/reports', 'doctor');
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('radio', { name: 'Draw' }).click();
  await sign(page);
  await expect(page.getByTestId('report-preview').getByRole('img', { name: 'Signature' })).toBeVisible();
  await page.getByRole('button', { name: 'Save as the doctor’s signature' }).click();
  await page.getByRole('button', { name: 'Save and print' }).click();
  await expect(page.locator('.li', { hasText: 'signed' }).first()).toBeVisible();
  await page.getByRole('button', { name: '+ New report' }).click();
  await page.getByRole('combobox', { name: 'Patient' }).selectOption({ index: 2 });
  await expect(page.getByRole('radio', { name: 'Saved signature' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('report-preview').getByRole('img', { name: 'Signature' })).toBeVisible();
});
