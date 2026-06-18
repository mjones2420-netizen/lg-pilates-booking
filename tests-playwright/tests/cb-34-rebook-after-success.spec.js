// CB-34 — Book Now works again after completing a booking (T1-07)
//
// Regression test for a bug where completing a bank-transfer booking
// destroyed the price <span> inside the Reserve button (via textContent=),
// causing openModal() to crash silently on the next call.  After the fix,
// clicking Book Now on any class card after the success screen must open
// the booking modal cleanly at Step 1.
//
// Flow:
//   1. Book a class as a returning client (fast path — no medical steps)
//   2. See the success screen
//   3. Click "Back to Schedule"
//   4. Click Book Now on a different class card
//   5. Verify the modal opens at Step 1 with the price span intact
//
// Self-cleaning: afterEach deletes the booking created in step 1.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { sb } = require('./helpers/supabase');
const { openBookingModal } = require('./helpers/booking-flow');
const { deleteBookingsForCustomerOnBlock } = require('./helpers/admin-db');

const RETURNING_EMAIL = 'returning-two@test.example';

test.describe('CB-34 — Book Now works after completing a booking', () => {

  let createdBooking = null;

  test.beforeEach(async ({ page }) => {
    createdBooking = null;
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner missing — refusing to run against production'
    ).toBeVisible();
  });

  test.afterEach(async () => {
    if (createdBooking) {
      await deleteBookingsForCustomerOnBlock(createdBooking.customerId, createdBooking.blockId);
    }
  });

  test('modal opens cleanly after closing success screen from a prior booking', async ({ page }) => {
    const friUpcoming = await getBlockByRole('fri-upcoming');
    expect(friUpcoming, 'fixture: fri-upcoming block must exist').toBeTruthy();

    // Look up the returning customer so afterEach can clean up
    const { data: customer, error: lookupErr } = await sb.rpc('lookup_customer', {
      p_email: RETURNING_EMAIL
    });
    expect(lookupErr, 'lookup_customer RPC must not error').toBeFalsy();
    expect(customer && customer.length, `fixture: ${RETURNING_EMAIL} must exist`).toBe(1);
    const customerId = customer[0].id;

    createdBooking = { customerId, blockId: friUpcoming.id };

    // ── Step 1: complete a booking ──────────────────────────────────────────
    await openBookingModal(page, 'Friday', 'current');

    await page.locator('#b-firstname').fill('Returning');
    await page.locator('#b-lastname').fill('Two');
    await page.locator('#b-email').fill(RETURNING_EMAIL);
    await page.locator('#b-phone').fill('07700900222');
    await page.locator('#step-1 .step-btn').click();

    // Returning client goes straight to Step 3 after the 2.5 s lookup delay
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 8000 });
    await page.locator('#tcs-agree').check();
    await expect(page.locator('#reserve-btn')).toBeEnabled();
    await page.locator('#reserve-btn').click();

    // Booking succeeds — success screen shown
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 10000 });

    // ── Step 2: return to schedule ──────────────────────────────────────────
    await page.locator('#success-view button.confirm-btn').click();
    await expect(page.locator('#overlay.on')).toBeHidden();

    // ── Step 3: open Book Now on a different class (Monday / current) ───────
    await openBookingModal(page, 'Monday', 'current');

    // Modal must open at Step 1 — this is the regression assertion.
    // Before the fix, openModal() crashed silently and nothing appeared.
    await expect(page.locator('#overlay.on'), 'modal must be visible after second Book Now click').toBeVisible();
    await expect(page.locator('#step-1'), 'step 1 must be visible on reopen').toBeVisible();
    await expect(page.locator('#step-2a'), 'step 2a must be hidden').toBeHidden();
    await expect(page.locator('#step-3'), 'step 3 must be hidden').toBeHidden();

    // The price span inside the Reserve button must exist and contain a price —
    // this is the element that was being destroyed by the bug.
    const btnPriceText = await page.locator('#m-btnprice').textContent();
    expect(btnPriceText, 'Reserve button price span must contain a £ amount').toMatch(/^£\d+/);
  });

});
