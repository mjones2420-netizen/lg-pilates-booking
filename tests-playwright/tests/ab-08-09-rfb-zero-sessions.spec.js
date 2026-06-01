// tests/ab-08-09-rfb-zero-sessions.spec.js
//
// AB (Admin Bookings) — Remove from Block, 0 sessions attended.
// Covers scenarios:
//   AB-08: RFB — 0 sessions attended, client has NOT paid → No refund needed.
//   AB-09: RFB — 0 sessions attended, client HAS paid → full refund shown.
//
// RFB flow for 0 sessions:
//   Step 1: sessions grid (0 selected by default) → Next
//   Step 1b: "Has this client paid?" → select paid/not paid → Next
//   Step 2: Review summary → Confirm Removal
//   Step 3: success → Done
//
// Setup: per-run new-client customer + booking on fri-upcoming (price £10,
// 6 weeks = £60 total). AB-09 sets booking status to 'confirmed' so the
// "Yes — paid £60.00" button renders the correct amount.
//
// Cleanup: afterEach deletes the per-run customer cascade. Safe to call even
// after the RFB flow has already deleted the booking — deleteCustomerCascade
// silently deletes 0 booking rows then removes the customer.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, setBookingStatus, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-08/AB-09 — RFB: 0 sessions attended', () => {
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

  // ── AB-08 ─────────────────────────────────────────────────────────────────

  test('AB-08 — 0 sessions, not paid: no refund flow, cancellation record saved', async ({ page }) => {
    const email = `ab08-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab08',
      p_last_name:  'Notpaid',
      p_email:      email,
      p_phone:      '07700900808',
      p_customer_type: 'returning'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custId;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    block.id,
      p_class_id:    block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr, 'book_if_available should not error').toBeNull();
    expect(bookingId).toBeTruthy();

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab08 Notpaid' }).first()).toBeVisible({ timeout: 10000 });

    // Open RFB modal
    const row = tbody.locator('tr', { hasText: 'Ab08 Notpaid' }).first();
    await row.locator('button', { hasText: 'Remove from Block' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#rfb-sub')).toContainText('Ab08 Notpaid');

    // Step 1: 0 sessions (default) → Next
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 1b: "Has this client paid?" shown
    await expect(page.locator('#rfb-body')).toContainText('Has this client already paid', { timeout: 3000 });
    await page.locator('#rfb-body button', { hasText: /No.*not paid/i }).click();
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 2: "No refund needed" green banner
    await expect(page.locator('#rfb-body')).toContainText('No refund needed', { timeout: 3000 });
    await expect(page.locator('#rfb-body')).toContainText('Ab08 Notpaid');
    await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();

    // Step 3: success
    await expect(page.locator('#rfb-body')).toContainText('removed from the block', { timeout: 8000 });
    await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });

    // Row gone from bookings table
    await expect(tbody.locator('tr', { hasText: 'Ab08 Notpaid' })).toHaveCount(0, { timeout: 8000 });

    // Cancellations DB record: refund_amount = 0
    const { rows } = await getPool().query(
      `SELECT refund_amount, refunded FROM cancellations WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [createdCustomerId]
    );
    expect(rows.length, 'cancellation record should exist').toBe(1);
    expect(parseFloat(rows[0].refund_amount)).toBe(0);
    expect(rows[0].refunded).toBe(false);
  });

  // ── AB-09 ─────────────────────────────────────────────────────────────────

  test('AB-09 — 0 sessions, client paid: full £60 refund shown and saved', async ({ page }) => {
    const email = `ab09-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab09',
      p_last_name:  'Haspaid',
      p_email:      email,
      p_phone:      '07700900909',
      p_customer_type: 'returning'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custId;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    block.id,
      p_class_id:    block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr, 'book_if_available should not error').toBeNull();
    expect(bookingId).toBeTruthy();

    // Set to confirmed so the "Yes — paid" button shows the full amount
    await setBookingStatus(bookingId, 'confirmed');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab09 Haspaid' }).first()).toBeVisible({ timeout: 10000 });

    const row = tbody.locator('tr', { hasText: 'Ab09 Haspaid' }).first();
    await row.locator('button', { hasText: 'Remove from Block' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });

    // Step 1: 0 sessions → Next
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 1b: select "Yes — paid £60.00"
    await expect(page.locator('#rfb-body')).toContainText('Has this client already paid', { timeout: 3000 });
    await page.locator('#rfb-body button', { hasText: /Yes.*paid/i }).click();
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 2: full refund shown in orange
    await expect(page.locator('#rfb-body')).toContainText('£60.00', { timeout: 3000 });
    await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();

    // Step 3: "A refund of £60.00 is owed"
    await expect(page.locator('#rfb-body')).toContainText('£60.00', { timeout: 8000 });
    await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });

    // Cancellations DB record: refund_amount = 60
    const { rows } = await getPool().query(
      `SELECT refund_amount, refunded FROM cancellations WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [createdCustomerId]
    );
    expect(rows.length, 'cancellation record should exist').toBe(1);
    expect(parseFloat(rows[0].refund_amount)).toBe(60);
    expect(rows[0].refunded).toBe(false);
  });
});
