// tests/dp-11-admin-view-cleared-parq.spec.js
//
// DP (Data Protection) — DP-11: All Bookings → View on a client whose health
// form was cleared shows a plain note instead of the answers (#90). Before
// this change the cleared NULLs rendered as "No" to every question, which
// would have misled Louise. The booking also shows a "Terms agreed" row.
//
// Fixture role: mon-upcoming (so the row shows on All Bookings). Self-cleaning.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-11 — View booking shows a cleared health form as deleted', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  let made = null;

  test.beforeEach(async ({ page }) => {
    made = null;
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => { if (made) await cleanupDpCustomer(made.customerId, made.email); });

  test('cleared form shows the retention note, no answers, and the terms row', async ({ page }) => {
    const blk = await getBlockByRole('mon-upcoming');
    made = await createDpCustomer({ tag: 'dp11', blocks: [blk], lastName: 'Dp11Cleared' });
    // Clear it directly (an upcoming booking is protected from the nightly job).
    await getPool().query(`SELECT public._clear_parq_for_customer($1)`, [made.customerId]);

    await loginAsAdmin(page);
    const row = page.locator('#btbody tr', { hasText: 'Dp11Cleared' }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button', { hasText: 'View' }).click();

    const body = page.locator('#view-body');
    await expect(page.locator('#view-overlay.on')).toBeVisible({ timeout: 5000 });
    await expect(body).toContainText(/Health form deleted on/i, { timeout: 8000 });
    await expect(body).not.toContainText('Medical Questions');
    await expect(body).not.toContainText('Sam Contact');
    await expect(body).toContainText('Terms agreed');
    await expect(body).toContainText(/Not recorded/);
  });
});
