// tests/ab-24-rfb-midblock-joiner.spec.js
//
// AB (Admin Bookings) — Remove from Block, mid-block joiner.
// Covers:
//   AB-24: RFB — client paid prorata £40 (4 of 6 sessions), 0 attended →
//          suggested refund = £40, not the full-block £60.
//
// Regression for issue #31: rfbCalcRefund() was using blk.weeks × pricePerSession
// (always the full block), ignoring the actual amount_due stored at booking time.
//
// Block: fri-upcoming — price £10/session, 6 weeks (full price £60).
// Booking: p_amount_due = 40 (prorata: joined mid-block, 4 sessions remaining).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, setBookingStatus, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-24 — RFB: mid-block joiner refund calc', () => {
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

  test('AB-24 — mid-block joiner paid £40: refund = £40 not £60', async ({ page }) => {
    const email = `ab24-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab24',
      p_last_name:  'Midblock',
      p_email:      email,
      p_phone:      '07700900824',
      p_customer_type: 'returning'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custId;

    // Prorata booking: joined mid-block, only 4 sessions remaining → paid £40
    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    block.id,
      p_class_id:    block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  40
    });
    expect(bookErr, 'book_if_available should not error').toBeNull();
    expect(bookingId).toBeTruthy();

    await setBookingStatus(bookingId, 'confirmed');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab24 Midblock' }).first()).toBeVisible({ timeout: 10000 });

    const row = tbody.locator('tr', { hasText: 'Ab24 Midblock' }).first();
    await row.locator('button', { hasText: 'Remove from Block' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#rfb-sub')).toContainText('Ab24 Midblock');

    // Step 1: 0 sessions (default) → Next
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 1b: "Yes" button should show £40.00 (not £60.00)
    await expect(page.locator('#rfb-body')).toContainText('Has this client already paid', { timeout: 3000 });
    await expect(page.locator('#rfb-body button', { hasText: /Yes.*paid/i })).toContainText('£40.00');
    await expect(page.locator('#rfb-body button', { hasText: /Yes.*paid/i })).not.toContainText('£60.00');

    await page.locator('#rfb-body button', { hasText: /Yes.*paid/i }).click();

    // Confirmation text should say £40.00
    await expect(page.locator('#rfb-body')).toContainText('£40.00');
    await expect(page.locator('#rfb-body')).not.toContainText('£60.00');

    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 2: refund shown = £40.00, not £60.00
    await expect(page.locator('#rfb-body')).toContainText('£40.00', { timeout: 3000 });
    await expect(page.locator('#rfb-body')).not.toContainText('£60.00');

    await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();

    // Step 3: success mentions £40.00
    await expect(page.locator('#rfb-body')).toContainText('£40.00', { timeout: 8000 });
    await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });

    // DB: cancellation record refund_amount = 40
    const { rows } = await getPool().query(
      `SELECT refund_amount, refunded FROM cancellations WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [createdCustomerId]
    );
    expect(rows.length, 'cancellation record should exist').toBe(1);
    expect(parseFloat(rows[0].refund_amount)).toBe(40);
    expect(rows[0].refunded).toBe(false);
  });
});
