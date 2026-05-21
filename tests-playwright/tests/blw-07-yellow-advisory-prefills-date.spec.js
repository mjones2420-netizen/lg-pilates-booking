// tests/blw-07-yellow-advisory-prefills-date.spec.js
//
// BLW (Block Warnings) — BLW-07: The "+ Add Block" button in the yellow
// advisory banner prefills the start date in the modal.
//
// Excel scenario BLW-07: "Yellow advisory — Add Block prefills date automatically"
//   Given: Admin is logged in, yellow advisory shows for a class with active
//          block but no next block
//   When:  Admin clicks "+ Add Block" in the advisory row
//   Then:  The Add Block modal opens with #ab-start already populated with
//          the suggested start date (one week after the active block ends)
//
// Mechanism (front-end):
//   For expiring classes, renderBlockWarnings() calls:
//     openAddBlockModal(classId, nextStartDate)
//   where nextStartDate = activeBlock.end_date + 7 days (YYYY-MM-DD).
//   openAddBlockModal() writes this into #ab-start.value.
//
// Fixture note:
//   We use Thursday (class_id=4) as the on/off switch — hiding thu-locked
//   makes Thursday "expiring". Thu-current's end_date is used to compute
//   the expected prefill value.
//
// Setup strategy:
//   Hide thu-locked → advisory fires for Thursday.
//   Read thu-current's end_date from DB to compute expected prefill.
//   afterEach restores thu-locked.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

test.describe('BLW-07 — Yellow advisory: Add Block prefills suggested start date', () => {
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

  test('Add Block in advisory banner prefills date = active block end + 7 days', async ({ page }) => {
    const thuLocked = await getBlockByRole('thu-locked');
    thuLockedId = thuLocked.id;

    const thuCurrent = await getBlockByRole('thu-current');

    // Compute the expected prefill: end_date + 7 days in YYYY-MM-DD format.
    const endDate = new Date(thuCurrent.end_date + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 7);
    const expectedPrefill = [
      endDate.getFullYear(),
      String(endDate.getMonth() + 1).padStart(2, '0'),
      String(endDate.getDate()).padStart(2, '0')
    ].join('-');

    // Hide thu-locked to trigger the yellow advisory for Thursday.
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE id = $1`,
      [thuLockedId]
    );

    await loginAsAdmin(page);

    // Wait for banner.
    await expect(page.locator('#ctbody tr').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#block-warnings')).toBeVisible();
    await expect(page.locator('#block-warnings')).toContainText(/active block but no next block/i);

    // Find the Thursday advisory row and click its "+ Add Block" button.
    const thuRow = page.locator('.block-warning-row').filter({ hasText: /Thursday/i }).first();
    await expect(thuRow).toBeVisible();
    await thuRow.getByRole('button', { name: /\+ Add Block/i }).click();

    // Modal should open.
    await expect(page.locator('#add-block-overlay.on')).toBeVisible({ timeout: 3000 });

    // The start date field should be pre-filled with the expected date.
    await expect(page.locator('#ab-start')).toHaveValue(expectedPrefill);

    // The subtitle should reference Thursday.
    await expect(page.locator('#ab-sub')).toContainText(/Thursday/i);

    // Close the modal without saving.
    await page.locator('#add-block-overlay button.mclose').click();
    await signOutAdmin(page);
  });
});
