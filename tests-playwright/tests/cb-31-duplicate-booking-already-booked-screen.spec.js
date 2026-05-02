// tests/cb-31-duplicate-booking-already-booked-screen.spec.js
//
// CB (Client Booking) — CB-31: Duplicate booking caught at Step 1 (already-booked screen).
//
// Excel scenario CB-31: "Duplicate booking caught at step 1 (already-booked screen)"
//   Given: A returning client who already has a non-cancelled booking on a current block
//   When:  They try to book the same class again
//   Then:  - Brief "Welcome back! Checking your bookings..." message shows
//          - Modal switches to the "You're already booked!" screen
//          - Screen shows green tick, class name, day/time, venue and block dates
//          - A Close button is visible
//          - No health form or payment step appears
//          - Step progress pips appear dimmed
//          - Clicking Close returns to the schedule
//
// Fixture: returning-one@test.example IS confirmed on mon-current (Monday Mixed
// Ability, active block). Re-booking that same block triggers the
// has_active_booking_on_block RPC duplicate detection (Item 17b).
//
// This test does NOT create new bookings — it just verifies the early-detection
// path renders correctly. Safe to re-run without reseeding.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;
const ALREADY_BOOKED_EMAIL = 'returning-one@test.example';

test.describe('CB-31 — Duplicate booking caught at Step 1', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('returning client already booked on this block sees the already-booked screen', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, {
      firstName: 'Returning',
      lastName:  'One',
      email:     ALREADY_BOOKED_EMAIL,
      phone:     '07700900031'
    });

    // First, the "Checking your bookings..." message appears
    const ccMsg = page.locator('#customer-check-msg');
    await expect(ccMsg).toBeVisible({ timeout: 5000 });
    await expect(ccMsg).toContainText(/Welcome back/i);
    await expect(ccMsg).toContainText(/Checking your bookings/i);

    // After 1.2s setTimeout, the already-booked view is shown
    await expect(page.locator('#already-booked-view')).toBeVisible({ timeout: 3000 });

    // Form view contents (Step 1 / 2a / 2b / 3) all hidden
    await expect(page.locator('#step-1')).not.toBeVisible();
    await expect(page.locator('#step-2a')).not.toBeVisible();
    await expect(page.locator('#step-2b')).not.toBeVisible();
    await expect(page.locator('#step-3')).not.toBeVisible();

    // The already-booked view shows the title and the tick icon container
    const abView = page.locator('#already-booked-view');
    await expect(abView).toContainText(/already booked/i);
    await expect(abView.locator('.ab-icon')).toBeVisible();

    // Block details are populated: Class, When, Venue, Block range rows
    const abDetails = page.locator('#ab-details');
    await expect(abDetails).toContainText('Class');
    await expect(abDetails).toContainText('When');
    await expect(abDetails).toContainText('Venue');
    await expect(abDetails).toContainText('Block');
    // Class name and day match the Mon Mixed fixture
    await expect(abDetails).toContainText(/Mixed Ability/);
    await expect(abDetails).toContainText(/Monday/);

    // Close button is visible inside the already-booked view
    const closeBtn = abView.locator('button.step-btn', { hasText: 'Close' });
    await expect(closeBtn).toBeVisible();

    // Step progress pips dimmed via opacity 0.3
    const opacity = await page.locator('#step-progress').evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);

    // Clicking Close hides the modal overlay
    await closeBtn.click();
    await expect(page.locator('#overlay.on')).not.toBeVisible();
  });
});
