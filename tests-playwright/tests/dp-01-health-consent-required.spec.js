// tests/dp-01-health-consent-required.spec.js
//
// DP (Data Protection) — DP-01: the health-consent box is required (#90).
//   Given: a new client on the Medical step with everything else filled in
//   When:  they press Continue without ticking the consent box
//   Then:  the validation toast names the consent box and the form stays put;
//          the box's Privacy notice link points at lg-pilates.co.uk/privacy
//          in a new tab. The link is checked, never clicked (clicking would
//          hit the live website and pollute Google Analytics).
//
// Fixture role: mon-current (Monday). No customer is created (no Reserve).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1, uniqueTestEmail } = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-01 — Health consent box is required', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('continue is blocked until the consent box is ticked, and the privacy link is correct', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, { firstName: 'Consent', lastName: 'Checker', email: uniqueTestEmail(901), phone: '07700900901' });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('#b-health-consent')).toBeVisible();
    await expect(page.locator('#b-health-consent')).not.toBeChecked();

    const link = page.locator('#privacy-link');
    await expect(link).toHaveAttribute('href', 'https://lg-pilates.co.uk/privacy');
    await expect(link).toHaveAttribute('target', '_blank');

    await page.locator('#b-age').fill('34');
    await page.locator('#b-print-name').fill('Consent Checker');
    await page.locator('#b-declaration').check();
    await page.locator('#step-2a .step-btn', { hasText: 'Continue' }).click();

    const toast = page.locator('#validation-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText(/agree to us keeping your health answers/i);
    await expect(page.locator('#step-2a')).toBeVisible();
    await expect(page.locator('#step-2b')).toBeHidden();

    // Ticking it lets the client through.
    await page.locator('#b-health-consent').check();
    await page.locator('#step-2a .step-btn', { hasText: 'Continue' }).click();
    await expect(page.locator('#step-2b')).toBeVisible();
  });
});
