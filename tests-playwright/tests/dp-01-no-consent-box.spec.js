// tests/dp-01-no-consent-box.spec.js
//
// DP (Data Protection) — DP-01: no health-consent box or privacy link (#90).
//   The consent tick box and its Privacy notice link were removed before
//   launch (Mark, 23 Oct 2026): the website privacy page is parked, so the
//   link would be a dead end.
//   Given: a new client on the Medical step
//   Then:  there is no consent box and no privacy link, and the declaration
//          alone lets them continue to Emergency contact.
//
// Fixture role: mon-current (Monday). No customer is created (no Reserve).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1, uniqueTestEmail } = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-01 — No health consent box or privacy link', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('medical step has no consent box or privacy link, and the declaration alone continues', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, { firstName: 'Consent', lastName: 'Checker', email: uniqueTestEmail(901), phone: '07700900901' });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('#b-health-consent')).toHaveCount(0);
    await expect(page.locator('#overlay a[href*="/privacy"]')).toHaveCount(0);

    await page.locator('#b-age').fill('34');
    await page.locator('#b-print-name').fill('Consent Checker');
    await page.locator('#b-declaration').check();
    await page.locator('#step-2a .step-btn', { hasText: 'Continue' }).click();
    await expect(page.locator('#step-2b')).toBeVisible();
  });
});
