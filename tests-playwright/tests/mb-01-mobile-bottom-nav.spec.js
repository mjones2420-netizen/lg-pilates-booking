// tests/mb-01-mobile-bottom-nav.spec.js
//
// MB (Mobile Dashboard) — MB-01: the bottom nav is reachable on a phone.
//
// Scenario (issue #103, symptom 2):
//   Given: the admin dashboard is open on an iPhone-sized viewport
//   When:  the warnings banner is present — collapsed, and again expanded
//   Then:  the bottom nav is visible AND sits entirely inside the viewport,
//          not below the fold or under the browser toolbar.
//
// Mechanism:
//   .db-layout height is calc(100dvh - var(--db-top)). --db-top is measured by
//   syncDashLayoutHeight() rather than hardcoded, because the chrome above the
//   dashboard varies (site nav alone in production, nav + TEST MODE banner
//   under ?env=test). A hardcoded offset was what pushed the nav off-screen.
//
// The plan called for a "with and without warnings" pair. The seeded fixture
// always produces warnings, so this asserts the two states that actually exist
// and matter: banner collapsed, and banner fully expanded (the worst case, and
// the exact condition that caused the production bug).
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

test.describe('MB-01 — Mobile bottom nav sits inside the viewport', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — MB specs require the app to be served.');
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner must be visible'
    ).toBeVisible({ timeout: 5000 });
  });

  test('MB-01 — bottom nav visible and fully on screen, banner collapsed and expanded', async ({ page }) => {
    await loginAsAdmin(page);

    const nav = page.locator('.db-bottom-nav');
    const sidebar = page.locator('.db-sidebar');

    // Mobile layout is active at 390px: bottom nav in, desktop sidebar out.
    await expect(nav).toBeVisible();
    await expect(sidebar).toBeHidden();

    // Wait for the dashboard's first render to settle — the warnings banner is
    // built after an async cancellations count, and it changes the layout.
    await expect(page.locator('#btbody tr').first()).not.toContainText('Loading...', { timeout: 15000 });
    await expect(page.locator('#dbwarn-summary')).toBeVisible({ timeout: 15000 });

    const collapsed = await nav.boundingBox();
    expect(collapsed, 'bottom nav should have a box').not.toBeNull();
    expect(
      collapsed.y + collapsed.height,
      'bottom nav bottom edge must be inside the viewport with the banner collapsed'
    ).toBeLessThanOrEqual(PHONE.height + 1);

    // Expand the warnings banner — this is what used to starve the content pane
    // and push the nav out of the clipped .db-layout box entirely.
    await page.locator('#dbwarn-summary').click();
    await expect(page.locator('#dbwarn-body')).toHaveClass(/\bon\b/);

    const expanded = await nav.boundingBox();
    expect(expanded, 'bottom nav should still have a box').not.toBeNull();
    expect(
      expanded.y + expanded.height,
      'bottom nav bottom edge must stay inside the viewport with the banner expanded'
    ).toBeLessThanOrEqual(PHONE.height + 1);
    await expect(nav).toBeVisible();
  });
});
