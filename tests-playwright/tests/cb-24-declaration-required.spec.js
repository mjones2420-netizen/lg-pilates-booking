// tests/cb-24-declaration-required.spec.js
//
// CB (Client Booking) — CB-24: declaration checkbox must be ticked to advance.
//
// Excel scenario CB-24: "Medical step — declaration must be signed before advancing"
//   Given: a new client at Step 2 with valid age and answers and print name filled
//   When:  the declaration checkbox is left UN-ticked and Continue is clicked
//   Then:  a toast fires with "You must agree to the declaration to continue"
//          and the form does not advance.
//
// Fixture role: mon-current

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-24 — Declaration must be ticked', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('un-ticked declaration blocks advance with validation toast', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'Decla',
      lastName:  'Ration',
      email:     uniqueTestEmail(24),
      phone:     '07700900024'
    });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });

    // Fill everything EXCEPT the declaration checkbox
    await page.locator('#b-age').fill('34');
    await page.locator('#b-print-name').fill('Decla Ration');
    // All 12 q radios default to No — no need to set them explicitly
    // Leave #b-declaration un-ticked
    await expect(page.locator('#b-declaration')).not.toBeChecked();

    await page.locator('#step-2a .step-btn', { hasText: 'Continue' }).click();

    const toast = page.locator('#validation-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText(/agree to the declaration/i);

    // Form must not have advanced
    await expect(page.locator('#step-2a')).toBeVisible();
    await expect(page.locator('#step-2b')).toBeHidden();
    await expect(page.locator('#step-3')).toBeHidden();
  });
});
