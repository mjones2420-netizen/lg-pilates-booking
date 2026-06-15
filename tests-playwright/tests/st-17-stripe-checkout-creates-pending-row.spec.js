// ST-17 — Stripe Checkout redirect creates a pending_bookings row, no real booking
//
// What this proves:
//   In Stripe payment mode, completing Step 4 of the booking modal calls the
//   live stripe-checkout Edge Function. This inserts a pending_bookings row
//   with the correct class_id/block_id/email/customer_type/amount_pence and
//   redirects the browser to Stripe Checkout. confirmBooking() does NOT call
//   book_if_available in Stripe mode — no row is added to bookings.
//
// Note on Stripe-side state:
//   This test calls the real stripe-checkout Edge Function (Stripe test mode),
//   which creates a real, incomplete Stripe Checkout Session. No payment is
//   made — the test only confirms the redirect happened and does not interact
//   with the Stripe-hosted page. The pending_bookings row is deleted in
//   afterEach regardless of pass/fail.
//
// Approach:
//   payment_mode is set to 'stripe' via direct pg BEFORE navigating, since
//   PAYMENT_MODE is read from settings on app init. returning-one@test.example
//   is used on fri-upcoming (2-step returning-client flow, no existing booking
//   on this block — see ST-08 notes) to reach Step 4 quickly. Clicking
//   "Proceed to Payment" triggers confirmBooking(), which redirects to
//   checkout.stripe.com.
//
// Cleanup:
//   afterEach restores payment_mode to bank_transfer and deletes the
//   pending_bookings row for TEST_EMAIL.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { openBookingModal, fillStep1, DEFAULT_NEW_CLIENT } = require('./helpers/booking-flow');
const {
  setPaymentMode,
  resetPaymentMode,
  getPendingBookingByEmail,
  deletePendingBookingByEmail,
  countBookingsForCustomerOnBlock
} = require('./helpers/admin-db');

const TEST_EMAIL = 'returning-one@test.example';

test.describe('ST-17 — Stripe checkout creates pending_bookings row, no real booking', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  test.beforeEach(async () => {
    await setPaymentMode('stripe');
  });

  test.afterEach(async () => {
    await resetPaymentMode();
    await deletePendingBookingByEmail(TEST_EMAIL);
  });

  test('Proceed to Payment creates a pending_bookings row and redirects to Stripe, with no bookings row added', async ({ page }) => {
    // Look up returning-one's customer id and the target block, so we can
    // confirm no bookings row appears for this (customer, block) pair.
    const lookupRes = await sb.rpc('lookup_customer', { p_email: TEST_EMAIL });
    expect(lookupRes.error).toBeNull();
    expect(lookupRes.data && lookupRes.data.length).toBeGreaterThan(0);
    const customerId = lookupRes.data[0].id;

    const blk = await getBlockByRole('fri-upcoming');

    const before = await countBookingsForCustomerOnBlock(customerId, blk.id);
    expect(before).toBe(0);

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    // Open Friday upcoming block, fill Step 1 with returning-one's email —
    // returning-client path auto-advances to Step 4.
    await openBookingModal(page, 'Friday');
    await fillStep1(page, { ...DEFAULT_NEW_CLIENT, email: TEST_EMAIL });

    await expect(page.locator('#step-3')).toBeVisible();
    await expect(page.locator('#stripe-pay-btn')).toBeVisible();
    await expect(page.locator('#stripe-pay-btn')).toContainText('Proceed to Payment');
    await expect(page.locator('#reserve-btn')).toBeHidden();

    await page.locator('#tcs-agree').check();
    await expect(page.locator('#stripe-pay-btn')).toBeEnabled();
    await page.locator('#stripe-pay-btn').click();

    // confirmBooking() calls the real stripe-checkout Edge Function and
    // redirects on success. Wait for navigation away to Stripe.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20000 });

    // Assert the pending_bookings row
    const pending = await getPendingBookingByEmail(TEST_EMAIL);
    expect(pending).not.toBeNull();
    expect(Number(pending.class_id)).toBe(blk.class_id);
    expect(Number(pending.block_id)).toBe(blk.id);
    expect(pending.email).toBe(TEST_EMAIL);
    expect(pending.customer_type).toBe('returning');
    expect(Number.isInteger(pending.amount_pence)).toBe(true);
    expect(pending.amount_pence).toBeGreaterThan(0);

    // Assert no real booking was created
    const after = await countBookingsForCustomerOnBlock(customerId, blk.id);
    expect(after).toBe(0);
  });
});
