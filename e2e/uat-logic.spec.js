// Logic UAT: every event must reach the person who has to act on it, and leave their list when it is dealt with.
import { test, expect } from '@playwright/test';
import { fresh, setRole, axe, toast } from './helpers.js';

const day = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA');
// Edit the saved data directly to stage a situation from an earlier day, then reload.
const stage = async (page, fn, arg) => { await page.evaluate(([f, a]) => { const d = JSON.parse(localStorage.getItem('pariDental.v1')); new Function('d', 'a', f)(d, a); localStorage.setItem('pariDental.v1', JSON.stringify(d)); }, [fn, arg]); await page.reload(); };
const badge = (page, name) => page.getByRole('link', { name: new RegExp('^' + name) }).locator('.count');

test('lab work arrives → reception is notified → call and confirm → fitting booked → cancelled booking comes back', async ({ page }) => {
  await fresh(page);
  // told on the front desk, in the menu badge, and on the call list
  await page.getByRole('region', { name: 'Needs attention' }).getByRole('button', { name: /Show all/ }).click();
  const notice = page.locator('.notices li', { hasText: 'Lab work arrived, call for fitting' });
  await expect(notice).toContainText('Ashok Rajan (PFM crown 46)');
  await notice.getByRole('button', { name: 'Call list' }).click();
  const toCall = page.getByTestId('to-call'), called = page.getByTestId('called');
  const first = toCall.locator('li').first();
  await expect(first).toHaveAttribute('data-kind', 'lab');
  await expect(first).toContainText('PFM crown 46 has arrived, book the fitting');
  const due = await toCall.locator('li .tm:not(:has-text("/")), li .tm.lt').count();
  expect(due).toBeGreaterThan(0);
  const before = +(await badge(page, 'Calendar').innerText());

  // call: WhatsApp text says it has arrived; marking as called moves it to the second list
  await first.getByRole('button', { name: /More actions/ }).click();
  await expect(page.getByRole('menuitem', { name: 'WhatsApp' })).toHaveAttribute('href', /pfm%20crown%2046%20has%20arrived/i);
  await page.getByRole('menuitem', { name: 'Mark as called' }).click();
  const mine = called.locator('li', { hasText: 'Ashok Rajan' });
  await expect(mine).toContainText('called');
  await expect(toCall).not.toContainText('Ashok Rajan');
  await expect(badge(page, 'Calendar')).toHaveText(String(before - 1));

  // confirm: book the fitting from the called list
  await mine.getByRole('button', { name: 'Book fitting' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByLabel('Reason')).toHaveValue('PFM crown 46 fitting');
  await dlg.getByLabel('Date').fill(day(2));
  await dlg.getByRole('button', { name: 'Book' }).click();
  await expect(toast(page)).toContainText('Booked Ashok Rajan');
  await expect(called).not.toContainText('Ashok Rajan');
  await expect(toCall).not.toContainText('Ashok Rajan');
  await page.getByRole('link', { name: /^Lab work/ }).click();
  await expect(page.getByTestId('lab-arrived').locator('li', { hasText: 'Ashok Rajan' })).toContainText('Fitting');
  await page.getByRole('link', { name: /^Front desk/ }).click();
  await page.getByRole('region', { name: 'Needs attention' }).getByRole('button', { name: /Show all/ }).click();
  await expect(page.locator('.notices li', { hasText: 'Lab work arrived' })).toHaveCount(0);

  // the booking is cancelled: he must not be forgotten
  await page.getByRole('link', { name: /^Calendar/ }).click();
  await page.locator('.wkd').nth(2).click();
  const booking = page.getByTestId('bookings').locator('li', { hasText: 'Ashok Rajan' });
  page.once('dialog', (d) => d.accept());
  await booking.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Cancel booking' }).click();
  await expect(toCall.locator('li', { hasText: 'Ashok Rajan' })).toHaveAttribute('data-kind', 'lab');
  await axe(page);
  await page.screenshot({ path: 'screenshots/desktop-call-list.png', fullPage: true });

  // the doctor is kept informed too
  await setRole(page, 'Doctor');
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.locator('.notices li', { hasText: 'Lab work arrived, reception is calling for fitting' })).toContainText('PFM crown 46 for Ashok Rajan');
});

test('a patient who misses a booking goes on the call list and can be rebooked', async ({ page }) => {
  await fresh(page, '/#/calendar');
  await stage(page, `d.appointments.push({ id: 'amiss', pid: 'p5', date: a, time: '10:00', reason: 'Review', status: 'booked' });`, day(-1));
  const row = page.getByTestId('to-call').locator('li[data-kind=missed]');
  await expect(row).toContainText('Fathima Begum');
  await expect(row).toContainText('Did not come on');
  await row.getByRole('button', { name: 'Rebook' }).click();
  const dlg = page.getByRole('dialog', { name: 'Reschedule' });
  await dlg.getByLabel('Date').fill(day(3));
  await dlg.getByRole('button', { name: 'Move booking' }).click();
  await expect(toast(page)).toContainText('Moved to');
  await expect(page.getByTestId('to-call').locator('li[data-kind=missed]')).toHaveCount(0);
  // yesterday shows who did not come
  await page.getByRole('button', { name: 'Previous week' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
});

test('a checkout left open yesterday is raised today and can be finished', async ({ page }) => {
  await fresh(page);
  await stage(page, `const q = d.queue.find((x) => x.pid === 'p17'); q.date = a; d.visits.find((v) => v.id === q.visitId).date = a;`, day(-1));
  await expect(page.getByTestId('today-list')).not.toContainText('Sangeetha Mohan');
  await page.getByRole('region', { name: 'Needs attention' }).getByRole('button', { name: /Show all/ }).click();
  const notice = page.locator('.notices li', { hasText: 'not finished from an earlier day' });
  await expect(notice).toContainText('Sangeetha Mohan');
  await notice.getByRole('button', { name: 'Checkout' }).click();
  const sheet = page.getByRole('dialog', { name: 'Sangeetha Mohan · checkout' });
  await sheet.getByRole('button', { name: 'Full' }).click();
  await sheet.getByRole('button', { name: 'Not needed' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toContainText('Saved · Sangeetha Mohan balance ₹0');
  await expect(page.locator('.notices li', { hasText: 'not finished from an earlier day' })).toHaveCount(0);
});

test('what one desk does shows up everywhere it matters', async ({ page }) => {
  await fresh(page);
  // an old balance is visible before the patient is sent in
  await expect(page.getByTestId('today-list').locator('li', { hasText: 'Arjun Selvam' })).toContainText(/Owes ₹[\d,]+ from earlier/);
  // menu badges match the lists behind them
  await page.getByRole('link', { name: /^Calendar/ }).click();
  await expect(page.getByTestId('to-call').locator('li').first()).toBeVisible();
  const dueRows = await page.getByTestId('to-call').locator('li').evaluateAll((ls) => ls.filter((l) => /Lab|Missed|Overdue|Today/.test(l.querySelector('.tm').textContent)).length);
  await expect(badge(page, 'Calendar')).toHaveText(String(dueRows));
  await page.getByRole('link', { name: /^Lab work/ }).click();
  await expect(badge(page, 'Lab work')).toHaveText('2'); // 1 arrived to call + 1 overdue from the supplier
  await page.getByRole('link', { name: /^Inventory/ }).click();
  await expect(page.locator('table.tbl tbody .pill').first()).toBeVisible();
  const alerts = await page.locator('table.tbl tbody .pill').count();
  await expect(badge(page, 'Inventory')).toHaveText(String(alerts));
  // doctor's Overview agrees with reception's numbers
  await setRole(page, 'Doctor');
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.locator('.kpi', { hasText: 'Stock alerts' }).locator('.kv')).toHaveText(String(alerts));
  await expect(page.locator('.kpi', { hasText: 'Patients today' })).toContainText('1 in the chair');
});
