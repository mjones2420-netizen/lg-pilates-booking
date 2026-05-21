// tests/blw-04-add-block-button-opens-modal.spec.js
//
// BLW (Block Warnings) — BLW-04: The "+ Add Block" button in the warning
// banner opens the Add Block modal scoped to the correct class.
//
// Excel scenario BLW-04: "+ Add Block button opens correct modal"
//   Given: Admin is logged in, a red warning banner is showing for Wednesday
//   When:  Admin clicks "+ Add Block" in the Wednesday warning row
//   Then:  The Add Block modal opens showing Wednesday's class name and time
//          in the subtitle (#ab-sub)
//
// Mechanism (front-end):
//   Each warning row's "+ Add Block" button calls
//   openAddBlockModal(classId) or openAddBlockModal(classId, prefillDate).
//   openAddBlockModal sets #ab-sub to "Add a block to {name} — {day} {time}".
//
// Setup strategy:
//   Hide all Wed blocks to trigger the red banner for Wednesday.
//   afterEach restores visible=true.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const WED_CLASS_ID = 2;

test.describe('BLW-04 — "+ Add Block" in warning banner opens correct modal', () => {
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

  test('Add Block button in red banner opens modal for the correct class', async ({ page }) => {
    // Trigger red banner for Wednesday.
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE class_id = $1`,
      [WED_CLASS_ID]
    );

    await loginAsAdmin(page);

    // Wait for banner to render.
    await expect(page.locator('#ctbody tr').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#block-warnings')).toBeVisible();

    // Find the Wednesday warning row and click its "+ Add Block" button.
    const wedRow = page.locator('.block-warning-row').filter({ hasText: /Wednesday/i }).first();
    await expect(wedRow).toBeVisible();
    await wedRow.getByRole('button', { name: /\+ Add Block/i }).click();

    // The Add Block modal should now be visible.
    await expect(page.locator('#add-block-overlay.on')).toBeVisible({ timeout: 3000 });

    // The subtitle should reference Wednesday.
    const sub = page.locator('#ab-sub');
    await expect(sub).toContainText(/Wednesday/i);

    // Modal start-date field should be empty (red banner buttons don't prefill).
    await expect(page.locator('#ab-start')).toHaveValue('');

    // Close modal before sign-out (scoped to the add-block overlay).
    await page.locator('#add-block-overlay button.mclose').click();
    await signOutAdmin(page);
  });
});
