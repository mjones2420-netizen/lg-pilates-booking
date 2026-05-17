// tests/ec-03-invalid-email-format.spec.js
//
// EC (Edge Cases) — EC-03: Invalid email format is rejected on Step 1.
//
// Excel scenario EC-03: "Invalid email format"
//   Given: The booking modal is open on Step 1
//   When:  The user types "notanemail" in the email field and clicks Continue
//   Then:  - A validation toast appears listing the email error
//          - The modal does NOT advance to Step 2
//
// Mechanism (front-end):
//   goStep2() in index.html (line ~1244) validates with the regex
//     /^[^\s@]+@[^\s@]+\.[^\s@]+$/
//   If the email fails, the error "Email address is not valid (e.g. name@example.com)"
//   is pushed onto errors[] and showValidationToast(errors) renders a #validation-toast
//   div listing each error as an <li>. The function returns BEFORE setting up the async
//   lookup_customer block, so the modal stays on Step 1.
//
// Target block: fri-upcoming (standard window, no priority gate) keeps the
// flow short — Friday card has no priority window to navigate around.
//
// No DB state created — the spec stops before any RPC call. No afterEach needed.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal } = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-03 — Invalid email format is rejected on Step 1', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('entering an invalid email shows a validation toast and the modal stays on Step 1', async ({ page }) => {
    await openBookingModal(page, 'Friday', 'current');

    // Sanity: Step 1 is visible, later steps are hidden.
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-2a')).toBeHidden();
    await expect(page.locator('#step-2b')).toBeHidden();
    await expect(page.locator('#step-3')).toBeHidden();

    // Fill Step 1 with valid name/phone but an invalid email.
    await page.locator('#b-firstname').fill('Test');
    await page.locator('#b-lastname').fill('User');
    await page.locator('#b-email').fill('notanemail');
    await page.locator('#b-phone').fill('07700900003');

    // Click Continue on Step 1.
    await page.locator('#step-1 .step-btn').click();

    // The validation toast should appear and contain the email error string.
    const toast = page.locator('#validation-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText(/Email address is not valid/i);

    // The modal must NOT have advanced — Step 1 still visible, Step 2a/2b hidden.
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-2a')).toBeHidden();
    await expect(page.locator('#step-2b')).toBeHidden();
  });
});
