// tests/cb-03-returning-client-skips-parq.spec.js
//
// CB (Client Booking) — CB-03: Returning client skips PAR-Q.
//
// Excel scenario CB-03: "Returning client skips PAR-Q"
//   Given: A customer who already exists in the system
//   When:  They book a class using their existing email and click Continue
//   Then:  Step 2 (Medical) and Step 2b (Emergency contact) are skipped
//          entirely; the modal advances directly to Step 3 (Payment).
//
// Fixture: returning-two@test.example is confirmed on mon-past, fri-recent-past,
// and mon-full — but NOT on mon-current. Booking mon-current with this email
// triggers the welcome-back returning-client flow (not the already-booked
// duplicate-detection screen).
//
// Self-cleaning: this test creates a real booking on mon-current. On a second
// run, returning-two will be already-booked and the welcome-back flow won't
// run. Test uses test.skip() pre-flight to handle this gracefully — same
// pattern as CB-13.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  agreeAndReserve
} = require('./helpers/booking-flow');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteBookingsForCustomerOnBlock } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const RETURNING_EMAIL = 'returning-two@test.example';

test.describe('CB-03 — Returning client skips PAR-Q', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('returning client jumps from Step 1 directly to Step 3 (Payment), skipping medical and emergency contact', async ({ page }) => {
    // Self-cleaning pre-flight: if a previous run left a booking for this
    // customer/block pair (or a cascading effect from CB-13 et al), delete
    // it via direct pg before continuing. Same pattern as CB-13 (Session 18).
    const monCurrent = await getBlockByRole('mon-current');
    const { data: lookupCust } = await sb.rpc('lookup_customer', { p_email: RETURNING_EMAIL });
    expect(lookupCust && lookupCust.length, `fixture: ${RETURNING_EMAIL} must exist`).toBe(1);
    const customerId = lookupCust[0].id;

    const { data: hasBooking } = await sb.rpc('has_active_booking_on_block', {
      p_customer_id: customerId,
      p_block_id: monCurrent.id
    });
    if (hasBooking === true) {
      await deleteBookingsForCustomerOnBlock(customerId, monCurrent.id);
      const { data: stillBooked } = await sb.rpc('has_active_booking_on_block', {
        p_customer_id: customerId, p_block_id: monCurrent.id
      });
      expect(stillBooked, 'cleanup failed — RPC still reports booking active').toBe(false);
    }

    await openBookingModal(page, 'Monday', 'current');

    // Use the EXISTING returning-two customer record. Don't use uniqueTestEmail
    // here — the whole point of this test is that the email is already known.
    await fillStep1(page, {
      firstName: 'Returning',
      lastName:  'Two',
      email:     RETURNING_EMAIL,
      phone:     '07700900003'
    });

    // After 2.5s setTimeout, the modal advances directly to Step 3 (Payment).
    // Medical (Step 2a) and Emergency Contact (Step 2b) MUST stay hidden.
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#step-2a')).not.toBeVisible();
    await expect(page.locator('#step-2b')).not.toBeVisible();

    // Step label should reflect returning-client 2-step layout
    await expect(page.locator('#step-3-label')).toContainText(/Step 2 of 2/);
    await expect(page.locator('#step-3-label')).toContainText(/Payment/);

    // Welcome-back message should have been shown
    const ccMsg = page.locator('#customer-check-msg');
    await expect(ccMsg).toContainText(/Welcome back/i);
    await expect(ccMsg).toContainText(/skip the health form/i);

    // The flow continues normally — finish the booking to confirm end-to-end
    await agreeAndReserve(page);
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 5000 });
  });
});
