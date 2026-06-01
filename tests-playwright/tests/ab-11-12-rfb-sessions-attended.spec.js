// tests/ab-11-12-rfb-sessions-attended.spec.js
//
// AB (Admin Bookings) — Remove from Block, sessions attended > 0.
// Covers scenarios:
//   AB-11: RFB — 3 of 6 sessions attended → refund = 3 remaining × £10 = £30.
//   AB-12: RFB — 2 of 6 sessions attended, refund override to £25.
//
// RFB flow for sessions > 0:
//   Step 1: select N sessions attended → Next (Step 1b is SKIPPED)
//   Step 2: Review summary with calculated refund (and optional override) → Confirm Removal
//   Step 3: success → Done
//
// Block: fri-upcoming — price £10/session, 6 weeks total.
//   3 sessions attended → 3 remaining → £30 calculated refund (AB-11)
//   2 sessions attended → 4 remaining → £40 calculated, override to £25 (AB-12)
//
// Setup: per-run confirmed booking on fri-upcoming via RPC + setBookingStatus.
// Cleanup: afterEach deletes the per-run customer cascade.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, setBookingStatus, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-11/AB-12 — RFB: sessions attended', () => {
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

  // ── AB-11 ─────────────────────────────────────────────────────────────────

  test('AB-11 — 3 sessions attended: refund = 3 remaining × £10 = £30', async ({ page }) => {
    const email = `ab11-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab11',
      p_last_name:  'Attended',
      p_email:      email,
      p_phone:      '07700901101',
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
    await setBookingStatus(bookingId, 'confirmed');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab11 Attended' }).first()).toBeVisible({ timeout: 10000 });

    const row = tbody.locator('tr', { hasText: 'Ab11 Attended' }).first();
    await row.locator('button', { hasText: 'Remove from Block' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });

    // Step 1: select 3 sessions attended
    await page.locator('#rfb-body button', { hasText: '3' }).click();
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 2: calculated refund = £30 (no Step 1b for sessions > 0)
    await expect(page.locator('#rfb-body')).toContainText('£30.00', { timeout: 3000 });
    // Override field visible
    await expect(page.locator('#rfb-override')).toBeVisible();
    await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();

    // Step 3: "A refund of £30.00 is owed"
    await expect(page.locator('#rfb-body')).toContainText('£30.00', { timeout: 8000 });
    await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });

    // Cancellations DB record
    const { rows } = await getPool().query(
      `SELECT sessions_attended, sessions_remaining, refund_amount
       FROM cancellations WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [createdCustomerId]
    );
    expect(rows.length, 'cancellation record should exist').toBe(1);
    expect(rows[0].sessions_attended).toBe(3);
    expect(rows[0].sessions_remaining).toBe(3);
    expect(parseFloat(rows[0].refund_amount)).toBe(30);
  });

  // ── AB-12 ─────────────────────────────────────────────────────────────────

  test('AB-12 — refund override: calculated £40 overridden to £25, saved correctly', async ({ page }) => {
    const email = `ab12-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab12',
      p_last_name:  'Override',
      p_email:      email,
      p_phone:      '07700901201',
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
    await setBookingStatus(bookingId, 'confirmed');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab12 Override' }).first()).toBeVisible({ timeout: 10000 });

    const row = tbody.locator('tr', { hasText: 'Ab12 Override' }).first();
    await row.locator('button', { hasText: 'Remove from Block' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });

    // Step 1: select 2 sessions attended
    await page.locator('#rfb-body button', { hasText: '2' }).click();
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 2: calculated refund = £40 shown, override to £25
    await expect(page.locator('#rfb-body')).toContainText('£40.00', { timeout: 3000 });
    await page.locator('#rfb-override').fill('25');
    // After override, confirm shows £25
    await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();

    // Step 3: "A refund of £25.00 is owed"
    await expect(page.locator('#rfb-body')).toContainText('£25.00', { timeout: 8000 });
    await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });

    // Cancellations DB record: override amount saved, not calculated amount
    const { rows } = await getPool().query(
      `SELECT refund_amount FROM cancellations WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [createdCustomerId]
    );
    expect(rows.length, 'cancellation record should exist').toBe(1);
    expect(parseFloat(rows[0].refund_amount)).toBe(25);
  });
});
