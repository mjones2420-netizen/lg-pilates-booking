// tests/ec-09-reserve-button-disabled-during-submission.spec.js
//
// EC (Edge Cases) — EC-09: Reserve button disabled during submission
//
// Excel scenario EC-09: "Reserve button disabled during submission"
//   Given: User is on Step 3 (Payment) of the booking modal
//   When:  User ticks T&Cs and clicks "Reserve My Spot"
//   Then:  - Button immediately disables (cannot be clicked again)
//          - Button text is UNCHANGED (still shows the price)
//          - Prevents double-submission
//
// Note: the button no longer changes text to "Reserving..." — that
// behaviour was removed in session 46 (T1-07 fix) because using
// textContent= destroyed the price <span> inside the button, causing
// openModal() to crash on the next booking attempt.
//
// Mechanism (front-end, confirmBooking()):
//   var confirmBtn = document.getElementById("reserve-btn");
//   if(confirmBtn){ confirmBtn.disabled = true; ... }
//   This runs SYNCHRONOUSLY at the top of confirmBooking() before any
//   async RPC call, so the disable is visible before the booking completes.
//
// Test approach:
//   The challenge is asserting the transient "Reserving..." state before
//   the booking completes and the success view replaces the form. Two
//   options were considered:
//     1. Network throttling — Playwright supports route() to delay
//        responses, but this affects ALL requests through the page and
//        is fragile.
//     2. Assert on the button state IMMEDIATELY after the click, with a
//        polling expect that runs faster than the full booking RPC chain.
//   We use option 2 with expect.poll on a snapshot read of disabled +
//   textContent. The poll runs every ~50ms and exits as soon as it sees
//   the "Reserving..." state — well before the success view appears
//   (which typically takes 200-800ms depending on network).
//
// Cleanup (afterEach):
//   Deletes the per-run customer via deleteCustomerCascade.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  uniqueTestEmail
} = require('./helpers/booking-flow');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-09 — Reserve button disabled during submission', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async ({ page }) => {
    createdCustomerId = null;
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (createdCustomerId != null) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('Reserve button disables (text unchanged) after click', async ({ page }) => {
    const friUpcoming = await getBlockByRole('fri-upcoming');
    expect(friUpcoming).toBeTruthy();

    const testEmail = uniqueTestEmail(9);

    // Advance through to Step 3.
    await openBookingModal(page, 'Friday', 'current');
    await fillStep1(page, {
      firstName: 'Submit',
      lastName:  'Once',
      email:     testEmail,
      phone:     '07700900009'
    });
    await fillStep2Medical(page, { age: 34, printName: 'Submit Once' });
    await fillStep2Emergency(page);

    // Confirm we're on Step 3 with a fresh, enabled-after-tick Reserve button.
    await expect(page.locator('#step-3')).toBeVisible();
    await expect(page.locator('#reserve-btn')).toBeDisabled(); // disabled until T&Cs ticked
    await page.locator('#tcs-agree').check();
    await expect(page.locator('#reserve-btn')).toBeEnabled();

    // Pre-click sanity: the button text starts with "Reserve My Spot".
    const preText = await page.locator('#reserve-btn').textContent();
    expect(preText).toMatch(/Reserve My Spot/i);

    // Click Reserve. Do NOT await any post-click navigation here — we want
    // to assert on the transient state as fast as possible.
    await page.locator('#reserve-btn').click();

    // Assert: button becomes disabled. Text must NOT change (the fix for T1-07
    // removed the textContent= call that used to say "Reserving..." because it
    // destroyed the price <span> inside the button, crashing subsequent openModal() calls).
    await expect.poll(
      async () => {
        return await page.locator('#reserve-btn').evaluate(btn => btn.disabled);
      },
      {
        message: 'Reserve button should be disabled immediately after click',
        timeout: 4000,
        intervals: [50, 100, 200]
      }
    ).toBe(true);

    // Text must still contain "Reserve My Spot" — it is not replaced with "Reserving...".
    const postText = await page.locator('#reserve-btn').textContent();
    expect(postText).toMatch(/Reserve My Spot/i);

    // Let the booking complete so afterEach can clean up.
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 10000 });

    // Look up customer ID for cleanup.
    const { data: custData } = await sb.rpc('lookup_customer', { p_email: testEmail });
    if (custData && custData.length > 0) {
      createdCustomerId = custData[0].id;
    }
  });
});
