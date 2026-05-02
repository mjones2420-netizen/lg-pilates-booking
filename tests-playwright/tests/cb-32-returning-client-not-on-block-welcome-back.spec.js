// tests/cb-32-returning-client-not-on-block-welcome-back.spec.js
//
// CB (Client Booking) — CB-32: Returning client NOT on this block — welcome-back flow continues normally.
//
// Excel scenario CB-32: "Returning client NOT on this block — welcome-back flow continues normally"
//   Given: A returning client who is NOT booked on a particular block
//   When:  They click 'Book Current Block' on that class and enter their existing email
//   Then:  - "Welcome back! As a returning customer you can skip the health form." message shows
//          - Modal advances to the payment step (NOT the already-booked screen)
//          - Flow continues normally to Reserve My Spot
//
// This is the regression-check companion to CB-31 — proves the early
// duplicate-detection branch (item 17b) doesn't false-positive a returning
// client onto the already-booked screen when they're booking a different block.
//
// Fixture: returning-one@test.example is confirmed on mon-past, wed-past,
// and mon-current — but NOT on fri-upcoming. Booking fri-upcoming triggers
// the welcome-back flow cleanly.
//
// Customer choice: returning-one is used here (not returning-two) because
// CB-13 already books returning-two onto fri-upcoming. Using returning-two
// here would cause CB-32 to skip whenever CB-13 ran first in the suite.
// returning-one + fri-upcoming is a unique combination across the CB suite.
//
// Self-cleaning: pre-flight test.skip() pattern same as CB-03.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  agreeAndReserve
} = require('./helpers/booking-flow');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;
const RETURNING_EMAIL = 'returning-one@test.example';

test.describe('CB-32 — Returning client NOT on this block — welcome-back flow continues normally', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('returning client not yet on this block sees welcome-back message and proceeds to payment', async ({ page }) => {
    // Pre-flight: skip cleanly if returning-one is somehow already booked
    // on fri-upcoming. CB-13 books returning-two (not -one) on this block,
    // so under normal conditions returning-one stays unbooked here.
    const friUpcoming = await getBlockByRole('fri-upcoming');
    const { data: hasBooking } = await sb.rpc('has_active_booking_on_block', {
      p_customer_id: (await sb.rpc('lookup_customer', { p_email: RETURNING_EMAIL })).data[0].id,
      p_block_id: friUpcoming.id
    });
    test.skip(
      hasBooking === true,
      'returning-one@test.example is already booked on fri-upcoming — run `npm run seed` to reset.'
    );

    await openBookingModal(page, 'Friday', 'current');

    await fillStep1(page, {
      firstName: 'Returning',
      lastName:  'One',
      email:     RETURNING_EMAIL,
      phone:     '07700900032'
    });

    // The welcome-back message should appear immediately (before the 2.5s
    // delay finishes and we move to Step 3).
    const ccMsg = page.locator('#customer-check-msg');
    await expect(ccMsg).toBeVisible({ timeout: 5000 });
    await expect(ccMsg).toContainText(/Welcome back/i);
    await expect(ccMsg).toContainText(/skip the health form/i);

    // Payment step should appear after the 2.5s setTimeout
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5000 });

    // Already-booked view must NOT be visible — this is the regression check
    await expect(page.locator('#already-booked-view')).not.toBeVisible();

    // Reserve button must be present and reachable
    await expect(page.locator('#reserve-btn')).toBeVisible();

    // Complete the flow end-to-end — proves "continues normally" really works
    await agreeAndReserve(page);
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 5000 });
  });
});
