// tests/ec-11-capacity-bar-updates-after-app-booking.spec.js
//
// EC (Edge Cases) — EC-11: Capacity bar updates automatically when a booking
// is made through the app
//
// Excel scenario EC-11: "Capacity bar updates automatically when a booking
// is made through the app"
//   Given: A class card shows "N of cap spots taken"
//   When:  A booking is completed through the full app flow
//   Then:  - blocks.booked is incremented to N+1 automatically
//          - After page reload, capacity bar shows "N+1 of cap spots taken"
//          - No manual SQL or intervention required
//
// Mechanism:
//   - bookings INSERT (via book_if_available RPC) triggers
//     trg_sync_block_booked_count, which recalculates blocks.booked from
//     the live booking count.
//   - On the success path the app also locally refetches blocks.booked
//     (index.html line 1543) and re-renders the grid.
//   - On page reload, the fresh blocks data is fetched from the DB.
//
// Test approach:
//   1. Snapshot blocks.booked for fri-upcoming from the DB.
//   2. Snapshot the capacity bar text on the class card.
//   3. Complete a full booking via the UI (new client → fri-upcoming).
//   4. Reload the page.
//   5. Assert capacity bar text now reads (N+1) of cap.
//   6. Direct-pg verify blocks.booked = N+1.
//
// Cleanup (afterEach):
//   deleteCustomerCascade for the per-run customer — restores fri-upcoming
//   to its seeded state.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  agreeAndReserve,
  uniqueTestEmail
} = require('./helpers/booking-flow');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPool, deleteCustomerCascade } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-11 — Capacity bar updates automatically when booking made via app', () => {
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

  test('booking via app increments capacity bar by 1 after reload', async ({ page }) => {
    const friUpcoming = await getBlockByRole('fri-upcoming');
    expect(friUpcoming, 'fri-upcoming should resolve from fixture').toBeTruthy();

    // Step 1 — snapshot DB state.
    const { rows: preRows } = await getPool().query(
      `SELECT booked, cap FROM blocks WHERE id = $1`,
      [friUpcoming.id]
    );
    const preBooked = preRows[0].booked;
    const cap = preRows[0].cap;

    // Step 2 — snapshot UI state on the Friday card.
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Friday' })
    }).first();
    await expect(card).toBeVisible();
    await expect(card.locator('.cap-txt').first())
      .toHaveText(`${preBooked} of ${cap} spots taken`);

    // Step 3 — complete a full booking via UI as a new client.
    const testEmail = uniqueTestEmail(11);
    await openBookingModal(page, 'Friday', 'current');
    await fillStep1(page, {
      firstName: 'Cap',
      lastName:  'Tester',
      email:     testEmail,
      phone:     '07700900011'
    });
    await fillStep2Medical(page, { age: 34, printName: 'Cap Tester' });
    await fillStep2Emergency(page);
    await agreeAndReserve(page);
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 10000 });

    // Capture customer ID for cleanup.
    const { data: custData } = await sb.rpc('lookup_customer', { p_email: testEmail });
    expect(custData).toBeTruthy();
    expect(custData.length).toBeGreaterThan(0);
    createdCustomerId = custData[0].id;

    // Step 4 — verify DB state: trigger should have bumped booked by 1.
    const { rows: postRows } = await getPool().query(
      `SELECT booked FROM blocks WHERE id = $1`,
      [friUpcoming.id]
    );
    expect(postRows[0].booked, 'trg_sync_block_booked_count should have incremented booked')
      .toBe(preBooked + 1);

    // Step 5 — reload the page and assert capacity bar reflects the new count.
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    const cardAfter = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Friday' })
    }).first();
    await expect(cardAfter).toBeVisible();
    await expect(cardAfter.locator('.cap-txt').first())
      .toHaveText(`${preBooked + 1} of ${cap} spots taken`);
  });
});
