// tests/blw-02-yellow-advisory-no-next-block.spec.js
//
// BLW (Block Warnings) — BLW-02: Yellow advisory banner appears when a class
// has an active block but no upcoming next block.
//
// Excel scenario BLW-02: "Yellow advisory — active block but no next block"
//   Given: Admin is logged in
//   When:  A class has an active block but no upcoming block behind it
//   Then:  The yellow advisory banner is visible and lists the class
//
// Mechanism (front-end):
//   renderBlockWarnings() identifies "expiring" classes — those with exactly
//   one visible active/upcoming block. These render in the yellow ⚠
//   "active block but no next block" banner.
//
// Fixture note:
//   Wednesday and Friday already have only 1 visible block each in the
//   clean fixture, so the advisory already fires for them. We use Thursday
//   (class_id=4) instead because it has BOTH thu-current (active) AND
//   thu-locked (upcoming), making it a clean on/off switch: hiding
//   thu-locked triggers the advisory for Thursday; restoring it removes it.
//
// Setup strategy:
//   Hide thu-locked so Thursday has only thu-current active → advisory fires.
//   afterEach restores visible=true on thu-locked.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

test.describe('BLW-02 — Yellow advisory: active block but no next block', () => {
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
    if (thuLockedId) {
      await getPool().query(
        `UPDATE blocks SET visible = true WHERE id = $1`,
        [thuLockedId]
      );
    }
  });

  test('yellow banner appears when class has active block but no upcoming block', async ({ page }) => {
    const thuLocked = await getBlockByRole('thu-locked');
    thuLockedId = thuLocked.id;

    // Hide thu-locked so Thursday has only one visible block (thu-current).
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE id = $1`,
      [thuLockedId]
    );

    await loginAsAdmin(page);

    // Wait for renderDashboard to complete.
    await expect(page.locator('#btbody tr').first()).toBeVisible({ timeout: 10000 });

    // The #block-warnings container should be visible.
    await expect(page.locator('#block-warnings')).toBeVisible();

    // The advisory text must be present somewhere in the warnings.
    await expect(page.locator('#block-warnings')).toContainText(/active block but no next block/i);

    // A .block-warning-row for Thursday should appear in the advisory.
    await expect(
      page.locator('.block-warning-row').filter({ hasText: /Thursday/i }).first()
    ).toBeVisible();

    await signOutAdmin(page);
  });
});
