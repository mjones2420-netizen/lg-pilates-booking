// tests/blw-05-banner-disappears-after-add.spec.js
//
// BLW (Block Warnings) — BLW-05: The warning banner row disappears after the
// admin adds a block to the affected class.
//
// Excel scenario BLW-05: "Banner disappears after block is added"
//   Given: Yellow advisory is showing for Thursday (active block, no next block)
//   When:  Admin adds a new block via the advisory row's "+ Add Block" button
//   Then:  Modal closes with "Block added!" toast, and no Thursday row appears
//          in the advisory banner on the re-rendered dashboard
//
// Mechanism (front-end):
//   saveNewBlock() on success calls closeAddBlockModal() then
//   buildFilters(); renderGrid(); renderDashboard() — which calls
//   renderBlockWarnings() again. With the new block, Thursday now has 2
//   visible blocks → no longer "expiring" → row disappears.
//
// Fixture note:
//   We use Thursday (class_id=4) as the on/off switch (hide thu-locked to
//   trigger the advisory, add a new Thu block to resolve it).
//
// Setup strategy:
//   Hide thu-locked → advisory fires for Thursday.
//   Add a new Thu block via UI (far-future Thursday date).
//   afterEach: delete the new block AND restore thu-locked visible=true.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const THU_CLASS_ID = 4;

/**
 * Returns a Thursday date at least minDaysAhead days from today, formatted
 * as YYYY-MM-DD. Used so the test date is well outside any existing block
 * range (avoiding the overlap-validation branch).
 */
function nextThursdayFarFuture(minDaysAhead = 300) {
  const d = new Date();
  d.setDate(d.getDate() + minDaysAhead);
  // Walk forward to next Thursday (day 4)
  while (d.getDay() !== 4) {
    d.setDate(d.getDate() + 1);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

test.describe('BLW-05 — Banner disappears after block is added', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — BLW specs require the app to be served.');
  test.skip(!ADMIN_PASSWORD, 'TEST_ADMIN_PASSWORD not set — admin specs require admin credentials.');

  let thuLockedId = null;
  let newBlockStartDate = null;

  test.beforeEach(async ({ page }) => {
    thuLockedId = null;
    newBlockStartDate = null;
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Restore thu-locked visibility regardless of pass/fail.
    if (thuLockedId) {
      await getPool().query(
        `UPDATE blocks SET visible = true WHERE id = $1`,
        [thuLockedId]
      );
    }
    // Delete the newly added block if the test reached that point.
    if (newBlockStartDate) {
      await getPool().query(
        `DELETE FROM blocks WHERE class_id = $1 AND start_date = $2`,
        [THU_CLASS_ID, newBlockStartDate]
      );
    }
  });

  test('banner row disappears after successfully adding a block', async ({ page }) => {
    const thuLocked = await getBlockByRole('thu-locked');
    thuLockedId = thuLocked.id;

    // Hide thu-locked → advisory fires for Thursday.
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE id = $1`,
      [thuLockedId]
    );

    await loginAsAdmin(page);

    // Wait for dashboard and banner.
    await expect(page.locator('#btbody tr').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#block-warnings')).toBeVisible();
    await expect(page.locator('#block-warnings')).toContainText(/active block but no next block/i);

    // Confirm Thursday advisory row is present before adding.
    const thuRow = page.locator('.block-warning-row').filter({ hasText: /Thursday/i }).first();
    await expect(thuRow).toBeVisible();

    // Click "+ Add Block" in the Thursday advisory row.
    await thuRow.getByRole('button', { name: /\+ Add Block/i }).click();
    await expect(page.locator('#add-block-overlay.on')).toBeVisible({ timeout: 3000 });

    // Fill in a valid far-future Thursday date.
    newBlockStartDate = nextThursdayFarFuture(300);
    await page.locator('#ab-start').fill(newBlockStartDate);
    await page.locator('#ab-weeks').selectOption('6');
    await page.locator('#ab-price').fill('10');
    await page.locator('#ab-cap').fill('12');

    // Submit.
    await page.locator('#ab-btn').click();

    // Modal should close and "Block added!" toast should appear.
    await expect(page.locator('#add-block-overlay.on')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('#toastEl.on')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#toastEl')).toContainText(/Block added/i);

    // Wait for the dashboard to re-render.
    await expect(page.locator('#btbody tr').first()).toBeVisible({ timeout: 10000 });

    // The Thursday warning row should no longer be present.
    // Either the entire banner is hidden or the Thursday row is gone.
    const warningsVisible = await page.locator('#block-warnings').isVisible();
    if (warningsVisible) {
      await expect(
        page.locator('.block-warning-row').filter({ hasText: /Thursday/i })
      ).toHaveCount(0);
    }

    await signOutAdmin(page);
  });
});
