// tests/dp-13-admin-delete-health-form.spec.js
//
// DP (Data Protection) — DP-13: Clients → Data → "Delete health form now"
// clears that client's form immediately, ignoring the retention period, and
// touches nobody else (#90). Bookings are kept. The action is logged.
//
// Fixture role: mon-upcoming. Self-cleaning.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, openClientsTab } = require('./helpers/admin-auth');
const { getAllParqByCustomerId, getDataProtectionLog, getBookingById } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-13 — Delete a client\'s health form now', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  let target = null;
  let bystander = null;

  test.beforeEach(async ({ page }) => {
    target = null; bystander = null;
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (target) await cleanupDpCustomer(target.customerId, target.email);
    if (bystander) await cleanupDpCustomer(bystander.customerId, bystander.email);
  });

  test('clears only the chosen client\'s form and keeps their booking', async ({ page }) => {
    const blk = await getBlockByRole('mon-upcoming');
    target = await createDpCustomer({ tag: 'dp13a', blocks: [blk], lastName: 'Dp13Target' });
    bystander = await createDpCustomer({ tag: 'dp13b', blocks: [blk], lastName: 'Dp13Bystander' });

    await loginAsAdmin(page);
    await openClientsTab(page);
    await page.locator(`#cust-row-${target.customerId} .cust-data-btn`).click();
    page.once('dialog', (d) => d.accept());
    await page.locator(`#cust-data-${target.customerId}`).getByRole('button', { name: 'Delete health form now' }).click();
    await expect(page.locator('#toastEl')).toContainText(/Health form deleted/i, { timeout: 8000 });

    const [cleared] = await getAllParqByCustomerId(target.customerId);
    expect(cleared.anonymised_at).toBeTruthy();
    expect(cleared.q3_blood_pressure).toBeNull();
    expect(cleared.emergency_name).toBeNull();
    expect(await getBookingById(target.bookingIds[0])).toBeTruthy();

    const [untouched] = await getAllParqByCustomerId(bystander.customerId);
    expect(untouched.anonymised_at).toBeNull();
    expect(untouched.emergency_name).toBe('Sam Contact');

    const log = await getDataProtectionLog(target.customerId);
    expect(log.map((r) => r.action)).toContain('admin_anonymise_parq');
  });
});
