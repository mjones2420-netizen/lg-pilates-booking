// tests/cb-23-age-validation.spec.js
//
// CB (Client Booking) — CB-23: age validation fires on Step 2 Continue.
//
// Excel scenario CB-23: "Medical step — age validation fires on Continue"
//   Two sub-cases, both covered in this spec as separate test() blocks:
//     1. Blank age     → toast "Age is required"
//     2. Age = 17      → toast "You must be at least 18 years old..."
//   In both cases, the form must NOT advance to Step 3.
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

// Gets a new-client booking into Step 2 (Medical) ready for the age assertions.
async function reachStep2(page, specNumber) {
  await openBookingModal(page, 'Monday', 'current');
  await fillStep1(page, {
    firstName: 'Age',
    lastName:  'Checker',
    email:     uniqueTestEmail(specNumber),
    phone:     '07700900023'
  });
  await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
}

// Fills the rest of Step 2 (declaration, print name) but leaves age to the caller.
async function fillStep2ExceptAge(page, { printName = 'Age Checker' } = {}) {
  await page.locator('#b-print-name').fill(printName);
  await page.locator('#b-declaration').check();
}

test.describe('CB-23 — Medical step age validation', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('blank age blocks advance with "Age is required" validation', async ({ page }) => {
    await reachStep2(page, 23);
    await fillStep2ExceptAge(page);

    // Leave age blank and try to continue
    await page.locator('#step-2a .step-btn', { hasText: 'Continue' }).click();

    const toast = page.locator('#validation-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText(/Age is required/i);

    // Must not have advanced to Step 3
    await expect(page.locator('#step-2a')).toBeVisible();
    await expect(page.locator('#step-2b')).toBeHidden();
    await expect(page.locator('#step-3')).toBeHidden();
  });

  test('age under 18 blocks advance with "at least 18" validation', async ({ page }) => {
    await reachStep2(page, 23);
    await fillStep2ExceptAge(page);

    await page.locator('#b-age').fill('17');
    await page.locator('#step-2a .step-btn', { hasText: 'Continue' }).click();

    const toast = page.locator('#validation-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText(/at least 18/i);

    await expect(page.locator('#step-2a')).toBeVisible();
    await expect(page.locator('#step-2b')).toBeHidden();
    await expect(page.locator('#step-3')).toBeHidden();
  });
});
