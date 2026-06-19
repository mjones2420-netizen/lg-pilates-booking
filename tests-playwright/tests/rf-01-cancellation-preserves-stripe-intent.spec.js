// tests/rf-01-cancellation-preserves-stripe-intent.spec.js
//
// RF (Refund sync) — Phase 1 / issue #27.
//
// When a client is removed from a block, rfbConfirm() inserts a cancellations
// row then DELETES the bookings row. Before this change the booking's
// stripe_payment_intent_id was lost. It must now be copied onto the
// cancellation row so Phase 2 (#28) can issue the real Stripe refund.
//
// Covers:
//   RF-01a: card-paid booking (has stripe_payment_intent_id) → intent is
//           preserved onto the cancellation row.
//   RF-01b: bank-transfer booking (no intent) → cancellation row holds NULL,
//           confirming the manual-flow case is unaffected.
//
// Block: fri-upcoming — price £10/session, 6 weeks. 3 sessions attended path
// (sessions > 0 skips the Step 1b "has paid" question), refund = £30.
//
// Setup: per-run confirmed booking on fri-upcoming via RPC + setBookingStatus.
// Cleanup: afterEach deletes the per-run customer cascade. (Cancellations rows
// are denormalised audit records and are intentionally NOT deleted.)

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  deleteCustomerCascade,
  setBookingStatus,
  setBookingStripeIntent,
  getPool
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('RF-01 — cancellation preserves Stripe payment intent', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — RF specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  // Shared: create a confirmed booking, optionally stamped with a Stripe intent,
  // then drive the Remove-from-Block flow (3 sessions attended) to completion.
  async function removeViaUi(page, lastName) {
    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: lastName }).first()).toBeVisible({ timeout: 10000 });

    const row = tbody.locator('tr', { hasText: lastName }).first();
    await row.locator('button', { hasText: 'Remove from Block' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });

    // Step 1: 3 sessions attended → Next (Step 1b skipped for sessions > 0)
    await page.locator('#rfb-body button', { hasText: '3' }).click();
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 2: calculated refund = £30 → Confirm Removal
    await expect(page.locator('#rfb-body')).toContainText('£30.00', { timeout: 3000 });
    await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();

    // Step 3: Done
    await expect(page.locator('#rfb-body')).toContainText('£30.00', { timeout: 8000 });
    await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });
  }

  // ── RF-01a ──────────────────────────────────────────────────────────────────

  test('RF-01a — card booking: stripe_payment_intent_id preserved on cancellation', async ({ page }) => {
    const email = `rf01a-${Date.now()}@test.example`;
    const intentId = `pi_test_rf01a_${Date.now()}`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Rf01a',
      p_last_name:  'CardPaid',
      p_email:      email,
      p_phone:      '07700930101',
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
    // Simulate the stripe-webhook stamping the confirmed card booking.
    await setBookingStripeIntent(bookingId, intentId);

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    await removeViaUi(page, 'Rf01a CardPaid');

    const { rows } = await getPool().query(
      `SELECT stripe_payment_intent_id, refund_amount
       FROM cancellations WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [createdCustomerId]
    );
    expect(rows.length, 'cancellation record should exist').toBe(1);
    expect(rows[0].stripe_payment_intent_id).toBe(intentId);
    expect(parseFloat(rows[0].refund_amount)).toBe(30);
  });

  // ── RF-01b ──────────────────────────────────────────────────────────────────

  test('RF-01b — bank-transfer booking: cancellation intent is NULL', async ({ page }) => {
    const email = `rf01b-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Rf01b',
      p_last_name:  'BankPaid',
      p_email:      email,
      p_phone:      '07700930201',
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
    // No Stripe intent set — this is a bank-transfer booking.

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    await removeViaUi(page, 'Rf01b BankPaid');

    const { rows } = await getPool().query(
      `SELECT stripe_payment_intent_id
       FROM cancellations WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [createdCustomerId]
    );
    expect(rows.length, 'cancellation record should exist').toBe(1);
    expect(rows[0].stripe_payment_intent_id).toBeNull();
  });
});
