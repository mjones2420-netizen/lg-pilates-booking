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
// Self-cleaning (Session 19, Batch 6): afterEach calls
// deleteBookingsForCustomerOnBlock to remove the booking this test creates
// on mon-current. Migrated from entry-side pre-flight check to exit-side
// cleanup for consistency with the rest of the Batch 6 rollout.

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

  // Self-cleaning (Session 19 / Batch 6): this spec books a FIXTURE customer
  // (returning-two) onto mon-current. The customer must persist across runs,
  // but the booking is junk. afterEach deletes just the booking via
  // deleteBookingsForCustomerOnBlock — same pattern as PB-X4 but scoped to
  // the booking, not the customer.
  let createdBooking = null;

  test.beforeEach(async ({ page }) => {
    createdBooking = null;
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (createdBooking) {
      await deleteBookingsForCustomerOnBlock(createdBooking.customerId, createdBooking.blockId);
    }
  });

  test('returning client jumps from Step 1 directly to Step 3 (Payment), skipping medical and emergency contact', async ({ page }) => {
    const monCurrent = await getBlockByRole('mon-current');
    const { data: lookupCust } = await sb.rpc('lookup_customer', { p_email: RETURNING_EMAIL });
    expect(lookupCust && lookupCust.length, `fixture: ${RETURNING_EMAIL} must exist`).toBe(1);
    const customerId = lookupCust[0].id;

    // Set tracking BEFORE the UI flow runs so afterEach cleans up even if
    // the UI assertions fail. If a previous run somehow left state behind
    // (e.g. afterEach didn't run due to a Playwright crash), the duplicate-
    // detection screen will trip and the UI assertions will fail — at which
    // point afterEach kicks in and clears it for next time.
    createdBooking = { customerId, blockId: monCurrent.id };

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
