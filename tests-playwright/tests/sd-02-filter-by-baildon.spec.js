/**
 * SD-02 — Filter by Baildon
 *
 * Clicks the Baildon location pill and asserts that only Baildon classes
 * remain visible, AND that the day filter row appears (per Excel SD-02
 * expected result: "Day filter buttons appear").
 *
 * No DB state created.
 */

const { test, expect } = require('@playwright/test');
const { APP_PATH }     = require('./helpers/app-url');
const { sb }           = require('./helpers/supabase');

test.describe('SD-02 — Filter by Baildon', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('only Baildon classes shown and day filter buttons appear', async ({ page }) => {
    // Query the DB for the set of Baildon class IDs that have a visible block.
    const { data, error } = await sb
      .from('blocks')
      .select('class_id, classes!inner(loc)')
      .in('status', ['active', 'upcoming'])
      .eq('classes.loc', 'Baildon');
    expect(error).toBeNull();
    const expectedClassIds = new Set(data.map(b => b.class_id));
    const expectedCount    = expectedClassIds.size;
    expect(expectedCount).toBeGreaterThan(0);

    // Click the Baildon pill.
    await page.locator('#fg-baildon-card').click();

    // Pill is in active state.
    await expect(page.locator('#fg-baildon-card')).toHaveClass(/on/);
    // "All Classes" no longer active.
    await expect(page.locator('#fb-all')).not.toHaveClass(/on/);

    // Day filter row is now visible (.filter-days-wrap.on switches display:block).
    await expect(page.locator('#filter-days-wrap')).toHaveClass(/on/);
    await expect(page.locator('#filter-row .fb').first()).toBeVisible();

    // Grid shows exactly the Baildon class count.
    await expect(page.locator('#grid .card')).toHaveCount(expectedCount);

    // Every visible card must show Baildon as its venue (sanity check).
    const venues = await page.locator('#grid .card .card-loc').allTextContents();
    expect(venues.length).toBe(expectedCount);
    for (const v of venues) {
      expect(v).toContain('Baildon');
    }
  });
});
