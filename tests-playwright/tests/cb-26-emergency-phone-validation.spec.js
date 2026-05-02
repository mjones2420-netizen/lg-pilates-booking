// tests/cb-26-emergency-phone-validation.spec.js
//
// CB (Client Booking) — CB-26: Emergency contact phone validation fires on Continue.
//
// Excel scenario CB-26: "Emergency contact step — phone validation fires on Continue"
//   Given: New client has reached Step 3 (Emergency Contact)
//   When:  They enter a contact name and relationship, but a too-short phone
//          ("12345"), and click Continue
//   Then:  Validation toast appears, "Emergency contact phone must be 11 digits"
//          message is shown, and the form does not advance to Payment.
//
// Fixture role: mon-current

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-26 — Emergency contact phone validation fires on Continue', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('short phone number triggers validation toast and blocks advance to payment', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, {
      firstName: 'Phone',
      lastName:  'Validator',
      email:     uniqueTestEmail(26),
      phone:     '07700900026'
    });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: 'Phone Validator' });

    // Step 2b is now visible — fill name + relationship, but short phone.
    await expect(page.locator('#step-2b')).toBeVisible();
    await page.locator('#b-emergency-name').fill('Jane Doe');
    await page.locator('#b-emergency-relationship').fill('Spouse');
    await page.locator('#b-emergency-phone').fill('12345');
    await page.locator('#step-2b .step-btn', { hasText: 'Continue' }).click();

    // Validation toast should appear with the phone-length message.
    const toast = page.locator('#validation-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText(/Emergency contact phone must be 11 digits/i);

    // Form must NOT advance — Step 2b still visible, Step 3 (Payment) hidden.
    await expect(page.locator('#step-2b')).toBeVisible();
    await expect(page.locator('#step-3')).not.toBeVisible();
    // Pip 4 must remain inactive (not in 'active' state).
    await expect(page.locator('#pip-4')).not.toHaveClass(/active/);
  });
});
