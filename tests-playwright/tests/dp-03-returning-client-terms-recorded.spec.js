// tests/dp-03-returning-client-terms-recorded.spec.js
//
// DP (Data Protection) — DP-03: a returning client's booking records the
// T&Cs version + time (#91). Returning clients skip the health form, so the
// terms record is the only consent evidence on their new booking.
//   Given: a returning client with a live (uncleared) health form on file
//   When:  they book Monday through the UI
//   Then:  they go straight to payment, and the new booking has terms_version set.
//
// Fixture roles: fri-old-past (their history), mon-current (the new booking).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1, agreeAndReserve } = require('./helpers/booking-flow');
const { getPool, resetPaymentMode } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-03 — Returning client booking records terms', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  let made = null;

  test.beforeEach(async ({ page }) => {
    made = null;
    await resetPaymentMode();
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (made) await cleanupDpCustomer(made.customerId, made.email);
  });

  test('returning client skips the health form and the booking records the terms version', async ({ page }) => {
    const past = await getBlockByRole('fri-old-past');
    const monCurrent = await getBlockByRole('mon-current');
    made = await createDpCustomer({ tag: 'dp03', blocks: [past], customerType: 'returning', lastName: 'Dp03' });
    const termsVersion = await page.evaluate(() => TERMS_VERSION);

    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, { firstName: 'Data', lastName: 'Dp03', email: made.email, phone: '07700900903' });
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 8000 });
    await agreeAndReserve(page);
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 5000 });

    const { rows } = await getPool().query(
      `SELECT terms_version, terms_accepted_at FROM bookings WHERE customer_id = $1 AND block_id = $2`,
      [made.customerId, monCurrent.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].terms_version).toBe(termsVersion);
    expect(rows[0].terms_accepted_at).toBeTruthy();
  });
});
