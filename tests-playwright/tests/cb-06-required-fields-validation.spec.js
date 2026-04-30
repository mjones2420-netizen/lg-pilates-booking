// tests/cb-06-required-fields-validation.spec.js
//
// CB (Client Booking) — CB-06: required fields validation on Step 1.
//
// Excel scenario CB-06: "Required fields validation"
//   Given: the booking modal is open on Step 1 (Your details)
//   When:  the user clicks Continue without entering anything
//   Then:  the form does not advance, and validation errors are surfaced
//
// Fixture role: mon-current

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal } = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-06 — Required fields validation', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('empty Step 1 fields block advance and show validation errors', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    // Click Continue with nothing filled in
    await page.locator('#step-1 .step-btn').click();

    // The validation toast should appear listing all required fields
    const toast = page.locator('#validation-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });

    // Toast should mention each missing field by name. The exact messages come
    // from goStep2() in index.html.
    await expect(toast).toContainText(/First name/i);
    await expect(toast).toContainText(/Last name/i);
    await expect(toast).toContainText(/Email/i);
    await expect(toast).toContainText(/Phone/i);

    // Critically: the form must NOT have advanced — Step 1 still visible,
    // Step 2 (Medical) still hidden.
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-2a')).toBeHidden();
  });
});
