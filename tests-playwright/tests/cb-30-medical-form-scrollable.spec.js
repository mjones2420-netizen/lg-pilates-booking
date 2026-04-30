// tests/cb-30-medical-form-scrollable.spec.js
//
// CB (Client Booking) — CB-30: medical form is fully scrollable.
//
// Excel scenario CB-30: "Medical form is scrollable — all content reachable"
//   Given: a new client is on Step 2 (Medical) in a narrow viewport
//   Then:  all 12 questions are reachable by scrolling,
//          the declaration and print name are visible at the bottom,
//          and the Continue button is reachable without zooming.
//
// Fixture role: mon-current
//
// Note: proper mobile coverage requires a Mobile Safari project in
// playwright.config.js. This test uses a shrunken desktop viewport as a
// reasonable proxy for now — see context.txt follow-up.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-30 — Medical form is scrollable', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('all medical form content is reachable by scrolling the modal', async ({ page }) => {
    // Narrow viewport forces the medical form to be longer than the visible area
    await page.setViewportSize({ width: 480, height: 700 });

    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'Scroll',
      lastName:  'Reacher',
      email:     uniqueTestEmail(30),
      phone:     '07700900030'
    });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });

    // The age field (at the top) should be reachable immediately
    await expect(page.locator('#b-age')).toBeVisible();

    // Question 12 (near the bottom of the form) should be reachable after scroll.
    // scrollIntoViewIfNeeded auto-scrolls the nearest scrollable ancestor, which
    // is .modal. If this times out, content isn't scrollable.
    const q12 = page.locator('input[name="q12"][value="No"]');
    await q12.scrollIntoViewIfNeeded();
    await expect(q12).toBeInViewport();

    // The declaration checkbox and Continue button at the very bottom
    const declaration = page.locator('#b-declaration');
    await declaration.scrollIntoViewIfNeeded();
    await expect(declaration).toBeInViewport();

    const continueBtn = page.locator('#step-2a .step-btn', { hasText: 'Continue' });
    await continueBtn.scrollIntoViewIfNeeded();
    await expect(continueBtn).toBeInViewport();
  });
});
