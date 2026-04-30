// tests/cb-29-sticky-header.spec.js
//
// CB (Client Booking) — CB-29: sticky header on medical form.
//
// Excel scenario CB-29: "Sticky header stays visible while scrolling medical form"
//   Given: a new client is on Step 2 (Medical), which is scrollable
//   When:  the user scrolls the modal down through the 12 questions
//   Then:  the .mhead (class name, venue, step pips) stays visible at the top
//          — it does not scroll away.
//
// Fixture role: mon-current
//
// Note: this test runs in the default desktop viewport. The Excel scenario
// flags mobile-specific behaviour, but proper mobile coverage requires a
// "Mobile Safari" project in playwright.config.js (see context.txt follow-up).
// In desktop mode, the sticky header still needs to behave correctly — that's
// what this test verifies.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-29 — Sticky header stays visible while scrolling', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('modal header stays visible after scrolling the medical form', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'Sticky',
      lastName:  'Header',
      email:     uniqueTestEmail(29),
      phone:     '07700900029'
    });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });

    // Shrink the viewport so the modal actually has to scroll. With the default
    // Playwright viewport (1280x720) the whole medical form may fit on screen
    // and there'd be nothing to test.
    await page.setViewportSize({ width: 480, height: 700 });

    // Grab the mhead rect BEFORE scrolling
    const mhead = page.locator('.mhead').first();
    await expect(mhead).toBeVisible();
    const beforeBox = await mhead.boundingBox();
    expect(beforeBox).not.toBeNull();

    // Scroll the modal itself to the bottom. The .modal element is the
    // single overflow-y: auto container per context.txt.
    await page.locator('.modal').first().evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });
    // Give the browser a frame to settle
    await page.waitForTimeout(200);

    // mhead should still be visible and still at (or near) the same top Y position
    await expect(mhead).toBeVisible();
    const afterBox = await mhead.boundingBox();
    expect(afterBox).not.toBeNull();

    // If the header is truly sticky, its top Y should not have moved off-screen.
    // Allow small tolerance for rounding, but it must not have disappeared upward.
    expect(afterBox.y).toBeGreaterThanOrEqual(0);
    expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThan(5);

    // Sanity: the declaration at the bottom should now be visible in the viewport
    await expect(page.locator('#b-declaration')).toBeInViewport();
  });
});
