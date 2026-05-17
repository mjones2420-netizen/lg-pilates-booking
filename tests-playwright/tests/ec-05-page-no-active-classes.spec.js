// tests/ec-05-page-no-active-classes.spec.js
//
// EC (Edge Cases) — EC-05: Page loads cleanly when there are no active or
// upcoming classes available, showing the empty-state message.
//
// Excel scenario EC-05: "Page loads with no active classes"
//   Given: All active/upcoming blocks have been hidden from public view
//   When:  The user visits the public booking page
//   Then:  - The page loads without JS errors
//          - An empty-state message is shown ("No classes available")
//
// Mechanism (front-end):
//   renderGrid() in index.html (line ~957) filters classes that have at
//   least one active or upcoming block. The filter inside getActiveBlock()
//   ignores blocks where `visible === false`. If no class has a renderable
//   block, the function falls into the empty branch at line ~965 which
//   writes the .no-filter-msg div into #grid with the title "No classes
//   available".
//
// Mechanism note (DEVIATION FROM EXCEL):
//   The Excel scenario suggests `UPDATE blocks SET status = 'archived'`
//   as the test setup. That SQL is wrong on two counts:
//     1. 'archived' is not a valid value for blocks.status — the
//        blocks_status_check constraint rejects it.
//     2. The front-end filter doesn't look at status at all — it filters
//        on `visible !== false` (same lever SD-06 used).
//   This spec uses `visible = false` as the actual mechanism. Excel
//   scenario wording will be updated at the end of the session.
//
// Cleanup:
//   Before flipping anything, we capture the original visible value of
//   every active/upcoming block. afterEach restores those values regardless
//   of pass/fail. No bookings or customers are created.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-05 — Page loads with no active classes', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  // Captured BEFORE the UPDATE so afterEach can always restore exact prior state.
  // Shape: [{ id: <blockId>, visible: <true|false|null> }, ...]
  let originalVisibleRows = [];

  test.beforeEach(async ({ page }) => {
    originalVisibleRows = [];

    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Restore each block's visible column to whatever it was before the test.
    if (originalVisibleRows.length === 0) return;
    for (const row of originalVisibleRows) {
      await getPool().query(
        `UPDATE blocks SET visible = $1 WHERE id = $2`,
        [row.visible, row.id]
      );
    }
  });

  test('hiding every active/upcoming block produces the "No classes available" empty state', async ({ page }) => {
    // Capture the current visibility of every block in active/upcoming status.
    // We hide ALL of them, not just one per class, because the front-end
    // filter looks across all blocks per class.
    const { rows: targets } = await getPool().query(
      `SELECT id, visible FROM blocks WHERE status IN ('active','upcoming')`
    );
    expect(targets.length, 'fixture must have at least one active or upcoming block').toBeGreaterThan(0);
    originalVisibleRows = targets;

    // Flip visible = false on all of them in one UPDATE.
    const ids = targets.map(r => r.id);
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE id = ANY($1::int[])`,
      [ids]
    );

    // Reload so the page picks up the new state.
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });

    // The grid should now show NO class cards.
    await expect(page.locator('#grid .card')).toHaveCount(0);

    // The empty-state message must render in its place.
    const emptyMsg = page.locator('#grid .no-filter-msg');
    await expect(emptyMsg).toBeVisible({ timeout: 5000 });
    await expect(emptyMsg).toContainText(/No classes available/i);
  });
});
