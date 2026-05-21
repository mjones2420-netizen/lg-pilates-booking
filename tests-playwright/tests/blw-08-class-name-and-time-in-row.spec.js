// tests/blw-08-class-name-and-time-in-row.spec.js
//
// BLW (Block Warnings) — BLW-08: Each warning banner row shows the class
// name AND its day/time so Louise can identify which class needs attention.
//
// Excel scenario BLW-08: "Class and time both shown in warning banner row"
//   Given: Admin is logged in, a red banner is showing for Wednesday
//   Then:  The Wednesday row in the banner contains:
//          - .block-warning-class: class name + "— Wednesday HH:MMam/pm"
//          - .block-warning-meta: venue and location text
//
// Mechanism (front-end):
//   renderBlockWarnings() builds each row as:
//     .block-warning-class: {name} — {day} {time}
//     .block-warning-meta:  {venue}, {loc}
//
// Setup strategy:
//   Hide all Wed blocks → trigger red banner for Wednesday.
//   afterEach restores visible=true.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const WED_CLASS_ID = 2;

test.describe('BLW-08 — Class name and time both shown in warning banner row', () => {
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
    await getPool().query(
      `UPDATE blocks SET visible = true WHERE class_id = $1`,
      [WED_CLASS_ID]
    );
  });

  test('warning row shows class name, day, time and venue for the affected class', async ({ page }) => {
    // Trigger red banner for Wednesday.
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE class_id = $1`,
      [WED_CLASS_ID]
    );

    await loginAsAdmin(page);

    // Wait for dashboard and banner.
    await expect(page.locator('#ctbody tr').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#block-warnings')).toBeVisible();

    // The Wednesday row should be present.
    const wedRow = page.locator('.block-warning-row').filter({ hasText: /Wednesday/i }).first();
    await expect(wedRow).toBeVisible();

    // .block-warning-class should contain the class name and "Wednesday".
    const classLabel = wedRow.locator('.block-warning-class');
    await expect(classLabel).toBeVisible();
    await expect(classLabel).toContainText(/Wednesday/i);
    // The format is "{name} — {day} {time}" so both name and day are present.
    await expect(classLabel).toContainText(/Beginner/i);

    // .block-warning-meta should contain venue information.
    const meta = wedRow.locator('.block-warning-meta');
    await expect(meta).toBeVisible();
    // Venue for Wed class in fixture is "Potting Shed" in Guiseley.
    await expect(meta).toContainText(/Guiseley/i);

    await signOutAdmin(page);
  });
});
