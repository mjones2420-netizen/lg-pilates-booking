// tests/ab-16-cancellations-csv-export.spec.js
//
// AB (Admin Bookings) — Cancellations CSV export.
// Covers scenario:
//   AB-16: Clicking "Export CSV" on the Cancellations tab triggers a download
//          with a filename matching lgpilates-cancellations-YYYY-MM-DD.csv.
//
// Setup: per-run customer removed via RFB flow to ensure at least one
// cancellations row exists before export is attempted.
//
// Cleanup: afterEach deletes the per-run customer cascade.
// Note: cancellations rows are not deleted by deleteCustomerCascade —
// they persist as audit records, but the test scopes the download assertion
// to the filename only so leftover rows from other tests don't interfere.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-16 — Cancellations CSV export', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('AB-16 — Export CSV downloads file with correct dated filename', async ({ page }) => {
    const email = `ab16-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    // Create per-run customer and booking
    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab16',
      p_last_name:  'Csvexport',
      p_email:      email,
      p_phone:      '07700901601',
      p_customer_type: 'returning'
    });
    expect(custErr).toBeNull();
    createdCustomerId = custId;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    block.id,
      p_class_id:    block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr).toBeNull();
    expect(bookingId).toBeTruthy();

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Run RFB to create a cancellations row
    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab16 Csvexport' }).first()).toBeVisible({ timeout: 10000 });
    const row = tbody.locator('tr', { hasText: 'Ab16 Csvexport' }).first();
    await row.locator('button', { hasText: 'Remove from Block' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();
    await expect(page.locator('#rfb-body')).toContainText('Has this client already paid', { timeout: 3000 });
    await page.locator('#rfb-body button', { hasText: /No.*not paid/i }).click();
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();
    await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();
    await expect(page.locator('#rfb-body')).toContainText('removed from the block', { timeout: 8000 });
    await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });

    // Switch to Cancellations tab
    await page.locator('#dbnav-cancellations').click();
    await expect(page.locator('#dbnav-cancellations.on')).toBeVisible();
    await expect(page.locator('#cancellations-tbody tr', { hasText: 'Ab16 Csvexport' }).first()).toBeVisible({ timeout: 8000 });

    // Trigger download and capture
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button[onclick="exportCancellations()"]').click()
    ]);

    // Filename: lgpilates-cancellations-YYYY-MM-DD.csv
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^lgpilates-cancellations-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
