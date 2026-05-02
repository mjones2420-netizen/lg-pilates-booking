// tests/cb-27-back-nav-emergency-to-details.spec.js
//
// CB (Client Booking) — CB-27: Back navigation from Emergency Contact → Medical → Your Details.
//
// Excel scenario CB-27: "Back navigation — Emergency contact → Medical → Your details"
//   Given: New client has progressed to Step 3 (Emergency Contact)
//   When:  They click Back, then click Back again on the Medical step
//   Then:  - Back from Step 3 returns to Step 2 (Medical) with pip 2 active
//          - Back from Step 2 returns to Step 1 (Your details) with pip 1 active
//          - Modal scrolls to top on each back step
//          - Previously entered data is preserved
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

test.describe('CB-27 — Back navigation Step 3 → Step 2 → Step 1', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('back nav from emergency contact preserves data and updates pip state correctly', async ({ page }) => {
    const firstName = 'Backy';
    const lastName  = 'Navigator';
    const email     = uniqueTestEmail(27);
    const phone     = '07700900027';
    const printName = 'Backy Navigator';

    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, { firstName, lastName, email, phone });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { age: 42, printName });

    // Now on Step 2b (Emergency Contact). Click Back to return to Step 2a.
    await expect(page.locator('#step-2b')).toBeVisible();

    // Scroll the modal down so we can verify the scrollModalTop() effect on Back.
    await page.locator('.overlay.on .modal').evaluate(el => { el.scrollTop = 200; });

    await page.locator('#step-2b .step-btn-back', { hasText: 'Back' }).click();

    // Back to Step 2 (Medical). Pip 2 active, pip 1 still done, pips 3 & 4 not active.
    await expect(page.locator('#step-2a')).toBeVisible();
    await expect(page.locator('#step-2b')).not.toBeVisible();
    await expect(page.locator('#pip-2')).toHaveClass(/active/);
    await expect(page.locator('#pip-1')).toHaveClass(/done/);
    await expect(page.locator('#pip-3')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-4')).not.toHaveClass(/active/);

    // Modal should have scrolled back to top (smooth scroll, so poll briefly).
    await expect.poll(
      async () => page.locator('.overlay.on .modal').evaluate(el => el.scrollTop),
      { timeout: 2000 }
    ).toBe(0);

    // Medical fields preserved.
    await expect(page.locator('#b-age')).toHaveValue('42');
    await expect(page.locator('#b-print-name')).toHaveValue(printName);
    await expect(page.locator('#b-declaration')).toBeChecked();

    // Scroll down again, then click Back to return to Step 1.
    await page.locator('.overlay.on .modal').evaluate(el => { el.scrollTop = 200; });

    await page.locator('#step-2a .step-btn-back', { hasText: 'Back' }).click();

    // Back to Step 1 (Your details). Pip 1 active, pips 2-4 not active.
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-2a')).not.toBeVisible();
    await expect(page.locator('#pip-1')).toHaveClass(/active/);
    await expect(page.locator('#pip-2')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-3')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-4')).not.toHaveClass(/active/);

    // Modal scrolls to top again.
    await expect.poll(
      async () => page.locator('.overlay.on .modal').evaluate(el => el.scrollTop),
      { timeout: 2000 }
    ).toBe(0);

    // Step 1 fields preserved.
    await expect(page.locator('#b-firstname')).toHaveValue(firstName);
    await expect(page.locator('#b-lastname')).toHaveValue(lastName);
    await expect(page.locator('#b-email')).toHaveValue(email);
    await expect(page.locator('#b-phone')).toHaveValue(phone);
  });
});
