/**
 * SD-06 — Class without blocks is hidden
 *
 * Verifies that a class with no visible active or upcoming blocks does NOT
 * render on the public booking page.
 *
 * Mechanism:
 *   - The Wednesday class (class_id=2) has exactly one upcoming block in
 *     the fixture (wed-upcoming). We temporarily flip its `visible` column
 *     to FALSE, reload the page, and assert the Wed card is gone.
 *   - `visible = false` is the correct lever (NOT `status`). The front-end
 *     filter is in getActiveBlock() at line ~886 of index.html:
 *
 *       blocks.filter(function(b){
 *         return b.class_id === classId && b.visible !== false;
 *       });
 *
 *     `status` is NOT part of this filter, so flipping status alone has no
 *     visible effect on the grid. `visible` is the column the front-end
 *     actually uses to hide blocks from public view.
 *   - The original `visible` value is captured before the UPDATE and
 *     restored in afterEach so the fixture is unchanged regardless of
 *     pass/fail.
 *
 * Why class 2: it's the only fixture class with a single visible block.
 * Hiding that block cleanly removes the class without affecting any other.
 * Class 1 (Mon), class 3 (Fri), class 4 (Thu) all have multiple visible
 * blocks so hiding one wouldn't remove the class from the grid.
 *
 * Self-cleaning: getPool() bypasses RLS via TEST_SUPABASE_DB_URL. The
 * UPDATE + restore pattern keeps the fixture stable across runs.
 */

const { test, expect } = require('@playwright/test');
const { APP_PATH }       = require('./helpers/app-url');
const { sb }             = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPool }        = require('./helpers/admin-db');

test.describe('SD-06 — Class without blocks is hidden', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  // Captured before the UPDATE so afterEach can restore even if the test fails.
  let hiddenBlockId    = null;
  let originalVisible  = null;

  test.beforeEach(async ({ page }) => {
    // Reset cleanup state for each test.
    hiddenBlockId   = null;
    originalVisible = null;

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test.afterEach(async () => {
    // Restore the hidden block to its original visibility, no matter what.
    if (hiddenBlockId != null && originalVisible != null) {
      await getPool().query(
        `UPDATE blocks SET visible = $1 WHERE id = $2`,
        [originalVisible, hiddenBlockId]
      );
    }
  });

  test('hiding a class\'s only visible block removes it from the grid', async ({ page }) => {
    // Look up wed-upcoming via fixture-lookup (block IDs are not stable).
    const wedUpcoming = await getBlockByRole('wed-upcoming');
    expect(wedUpcoming).toBeTruthy();

    // Baseline: confirm the Wed class is currently visible on the grid.
    const { data: baselineData, error: baselineErr } = await sb
      .from('blocks')
      .select('class_id')
      .in('status', ['active', 'upcoming']);
    expect(baselineErr).toBeNull();
    const baselineClassIds = new Set(baselineData.map(b => b.class_id));
    const baselineCount    = baselineClassIds.size;
    expect(baselineClassIds.has(2)).toBe(true); // Wed class is visible pre-change.

    // Read the current `visible` value directly (fixture-lookup doesn't
    // include it). Capture BEFORE the UPDATE so afterEach can always
    // restore.
    const { rows } = await getPool().query(
      `SELECT visible FROM blocks WHERE id = $1`,
      [wedUpcoming.id]
    );
    expect(rows.length).toBe(1);
    originalVisible = rows[0].visible;
    hiddenBlockId   = wedUpcoming.id;

    // Hide the block from public view.
    await getPool().query(
      `UPDATE blocks SET visible = false WHERE id = $1`,
      [hiddenBlockId]
    );

    // Reload so the page picks up the new visibility.
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();

    // Grid should now have one fewer class card than the baseline.
    await expect(page.locator('#grid .card')).toHaveCount(baselineCount - 1);

    // No card should show the Wednesday day label any more.
    const days = await page.locator('#grid .card .card-when-day').allTextContents();
    expect(days).not.toContain('Wednesday');
  });
});
