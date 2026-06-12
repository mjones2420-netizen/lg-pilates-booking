// tests/blw-03-both-banners.spec.js
//
// BLW (Block Warnings) — BLW-03: Both red and yellow banners render when
// both conditions exist simultaneously.
//
// Excel scenario BLW-03: "Both banners show when both conditions exist"
//   Given: Admin is logged in
//   When:  One class has no active/upcoming block AND another class has an
//          active block but no next block
//   Then:  Both the red 🚫 and yellow ⚠ banners are visible in #block-warnings
//
// Mechanism (front-end):
//   renderBlockWarnings() renders hidden[] (red banner) first, then
//   expiring[] (yellow banner). Both render in #block-warnings when
//   hidden.length > 0 AND expiring.length > 0.
//
// Fixture note:
//   Wed and Fri already trigger the advisory in the clean state. We use
//   Thursday as the "clean on/off switch" for the yellow condition — hiding
//   thu-locked makes Thursday expiring. For the red condition, we hide all
//   Wed blocks (class_id=2) so Wednesday has no active/upcoming block.
//   afterEach restores both.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const WED_CLASS_ID = 2;

test.describe('BLW-03 — Both red and yellow banners render simultaneously', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — BLW specs require the app to be served.');
  test.skip(!ADMIN_PASSWORD, 'TEST_ADMIN_PASSWORD not set — admin specs require admin credentials.');

  let thuLockedId = null;

  test.beforeEach(async ({ page }) => {
    thuLockedId = null;
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    await getPool().query(
      `UPDATE blocks SET visible = true WHERE class_id = $1`,
      [WED_CLASS_ID]
    );
    if (thuLockedId) {
      await getPool().query(
        `UPDATE blocks SET visible = true WHERE id = $1`,
        [thuLockedId]
      );
    }
  });

  test('red and yellow banners both render when both conditions are present', async ({ page }) => {
    const thuLocked = await getBlockByRole('thu-locked');
    thuLockedId = thuLocked.id;

    // Red condition: hide all Wed blocks (class has no active/upcoming block).
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE class_id = $1`,
      [WED_CLASS_ID]
    );

    // Yellow condition: hide thu-locked so Thursday has active but no next block.
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE id = $1`,
      [thuLockedId]
    );

    await loginAsAdmin(page);

    // Wait for dashboard render.
    await expect(page.locator('#btbody tr').first()).toBeVisible({ timeout: 10000 });

    // The warnings container must be visible.
    await expect(page.locator('#block-warnings')).toBeVisible();

    // Count .block-warning divs — expect at least 2 (one red, one yellow).
    // The fixture's Wed/Fri single-block classes also fire the advisory, so
    // there may be more than 2 — we assert >= 2 rather than exactly 2.
    const banners = page.locator('.block-warning');
    const bannerCount = await banners.count();
    expect(bannerCount).toBeGreaterThanOrEqual(2);

    // Red banner: contains "no active or upcoming block".
    await expect(page.locator('#block-warnings')).toContainText(/no active or upcoming block/i);

    // Yellow banner: contains "active block but no next block".
    await expect(page.locator('#block-warnings')).toContainText(/active block but no next block/i);

    // Wednesday row appears in the red banner.
    await expect(
      page.locator('.block-warning-row').filter({ hasText: /Wednesday/i }).first()
    ).toBeVisible();

    // Thursday row appears in the yellow banner.
    await expect(
      page.locator('.block-warning-row').filter({ hasText: /Thursday/i }).first()
    ).toBeVisible();

    await signOutAdmin(page);
  });
});
