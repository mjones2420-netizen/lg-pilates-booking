/**
 * SD-03 — Filter by Guiseley
 *
 * Clicks the Guiseley location pill and asserts that only Guiseley classes
 * remain visible.
 *
 * No DB state created.
 */

const { test, expect } = require('@playwright/test');
const { APP_PATH }     = require('./helpers/app-url');
const { sb }           = require('./helpers/supabase');

test.describe('SD-03 — Filter by Guiseley', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('only Guiseley classes shown', async ({ page }) => {
    // Query the DB for the set of Guiseley class IDs that have a visible block.
    const { data, error } = await sb
      .from('blocks')
      .select('class_id, classes!inner(loc)')
      .in('status', ['active', 'upcoming'])
      .eq('classes.loc', 'Guiseley');
    expect(error).toBeNull();
    const expectedClassIds = new Set(data.map(b => b.class_id));
    const expectedCount    = expectedClassIds.size;
    expect(expectedCount).toBeGreaterThan(0);

    // Click the Guiseley pill.
    await page.locator('#fg-guiseley-card').click();

    // Pill is in active state.
    await expect(page.locator('#fg-guiseley-card')).toHaveClass(/on/);
    // "All Classes" no longer active.
    await expect(page.locator('#fb-all')).not.toHaveClass(/on/);

    // Grid shows exactly the Guiseley class count.
    await expect(page.locator('#grid .card')).toHaveCount(expectedCount);

    // Every visible card must show Guiseley as its venue.
    const venues = await page.locator('#grid .card .card-loc').allTextContents();
    expect(venues.length).toBe(expectedCount);
    for (const v of venues) {
      expect(v).toContain('Guiseley');
    }
  });
});
