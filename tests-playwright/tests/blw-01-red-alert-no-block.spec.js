// tests/blw-01-red-alert-no-block.spec.js
//
// BLW (Block Warnings) — BLW-01: Red alert banner appears when a class has
// no active or upcoming block.
//
// Excel scenario BLW-01: "Red alert — class with no block at all"
//   Given: Admin is logged in
//   When:  A class exists that has no visible active or upcoming block
//   Then:  The red #block-warnings banner is visible and contains a row
//          identifying the class by name and day/time
//
// Mechanism (front-end):
//   renderBlockWarnings() in index.html filters classes whose blocks all
//   either have end_date < today or visible=false. These appear in the red
//   🚫 "not visible on the booking page" banner.
//
// Setup strategy:
//   The fixture has all classes covered. To trigger the red banner we set
//   visible=false on ALL blocks belonging to one class (Wed Beginner,
//   class_id=2). afterEach restores visible=true on those blocks.
//
//   We use class_id=2 (Wed Beginner) because it has only 2 blocks in the
//   fixture (wed-past completed, wed-upcoming upcoming), so the UPDATE is
//   minimal and low-risk.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

// Wed Beginner class_id in the fixture
const WED_CLASS_ID = 2;

test.describe('BLW-01 — Red alert: class with no active or upcoming block', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — BLW specs require the app to be served.');
  test.skip(!ADMIN_PASSWORD, 'TEST_ADMIN_PASSWORD not set — admin specs require admin credentials.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Restore all Wed blocks to visible=true regardless of pass/fail.
    await getPool().query(
      `UPDATE blocks SET visible = true WHERE class_id = $1`,
      [WED_CLASS_ID]
    );
  });

  test('red banner appears when all blocks for a class are hidden', async ({ page }) => {
    // Hide all Wed blocks so the class has no visible active/upcoming block.
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE class_id = $1`,
      [WED_CLASS_ID]
    );

    await loginAsAdmin(page);

    // Wait for renderDashboard to complete — ctbody must be populated.
    await expect(page.locator('#btbody tr').first()).toBeVisible({ timeout: 10000 });

    // The #block-warnings container should now be visible.
    await expect(page.locator('#block-warnings')).toBeVisible();

    // The red banner title contains the 🚫 marker and the "no active or upcoming block" text.
    const title = page.locator('.block-warning-title').first();
    await expect(title).toContainText(/no active or upcoming block/i);

    // A .block-warning-row for the Wednesday class should be present.
    const rows = page.locator('.block-warning-row');
    await expect(rows.filter({ hasText: /Wednesday/i }).first()).toBeVisible();

    await signOutAdmin(page);
  });
});
