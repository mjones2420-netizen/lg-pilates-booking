// tests/dp-12-admin-export-customer.spec.js
//
// DP (Data Protection) — DP-12: Clients → Data → Download data gives Louise
// one file with everything held on a client, for a "what do you hold on me?"
// request (#90). The export is logged.
//
// Fixture role: mon-upcoming. Self-cleaning.

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, openClientsTab } = require('./helpers/admin-auth');
const { getDataProtectionLog } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-12 — Download a client\'s data', () => {
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

  test('download contains the client\'s records and is logged', async ({ page }) => {
    const blk = await getBlockByRole('mon-upcoming');
    made = await createDpCustomer({ tag: 'dp12', blocks: [blk], lastName: 'Dp12' });

    await loginAsAdmin(page);
    await openClientsTab(page);
    const row = page.locator(`#cust-row-${made.customerId}`);
    await row.locator('.cust-data-btn').click();
    const panel = page.locator(`#cust-data-${made.customerId}`);
    await expect(panel).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      panel.getByRole('button', { name: 'Download data' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^lgpilates-customer-${made.customerId}-\\d{4}-\\d{2}-\\d{2}\\.json$`));
    const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));

    expect(data.customer.email).toBe(made.email);
    expect(data.bookings).toHaveLength(1);
    expect(data.bookings[0].class_name).toBeTruthy();
    expect(data.health_forms).toHaveLength(1);
    expect(data.health_forms[0].emergency_name).toBe('Sam Contact');
    for (const key of ['cancellations', 'waiting_lists', 'waiting_list_requests', 'pending_card_payments', 'catch_up_swaps', 'class_priority', 'terms_agreed']) {
      expect(Array.isArray(data[key]), `${key} should be a list`).toBe(true);
    }

    const log = await getDataProtectionLog(made.customerId);
    expect(log.map((r) => r.action)).toContain('admin_export_customer');
  });
});
