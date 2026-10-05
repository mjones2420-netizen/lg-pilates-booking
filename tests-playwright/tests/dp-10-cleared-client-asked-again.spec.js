// tests/dp-10-cleared-client-asked-again.spec.js
//
// DP (Data Protection) — DP-10: once a client's health form has been cleared
// under the retention policy, they are asked to fill it in again (#90).
// Without the lookup-customer-throttled change, a 'returning' client whose
// only form was cleared would skip the health questions for ever.
//   Given: a returning client whose only PAR-Q has been cleared
//   When:  they enter their email on step 1
//   Then:  the Medical step (2a) appears, not payment.
//
// Fixture roles: fri-old-past (history), mon-current (booking attempt). No Reserve.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1 } = require('./helpers/booking-flow');
const { runAnonymise } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer, shiftDate } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-10 — Cleared client is asked for the health form again', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  let made = null;

  test.beforeEach(async ({ page }) => {
    made = null;
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

  test('returning client with a cleared form lands on the Medical step', async ({ page }) => {
    const past = await getBlockByRole('fri-old-past');
    made = await createDpCustomer({ tag: 'dp10', blocks: [past], customerType: 'returning', lastName: 'Dp10' });
    const cleared = await runAnonymise({ customerId: made.customerId, asOf: shiftDate(past.end_date, { months: 13 }), months: 12 });
    expect(cleared).toBe(1);

    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, { firstName: 'Data', lastName: 'Dp10', email: made.email, phone: '07700900910' });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#step-3')).toBeHidden();
  });
});
