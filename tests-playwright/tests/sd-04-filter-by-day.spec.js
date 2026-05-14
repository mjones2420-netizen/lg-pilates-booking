/**
 * SD-04 — Filter by day within a location
 *
 * Clicks Baildon, then clicks the Monday day button, and asserts that only
 * Baildon Monday classes are visible.
 *
 * No DB state created.
 *
 * Monday is the chosen day because the fixture guarantees a Baildon Monday
 * class (class 1 — Mon Mixed at Baildon Moravian Church).
 */

const { test, expect } = require('@playwright/test');
const { APP_PATH }     = require('./helpers/app-url');
const { sb }           = require('./helpers/supabase');

test.describe('SD-04 — Filter by day within a location', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('Baildon + Monday shows only Baildon Monday classes', async ({ page }) => {
    // Query the DB for the set of Baildon+Monday class IDs that have a visible block.
    const { data, error } = await sb
      .from('blocks')
      .select('class_id, classes!inner(loc, day)')
      .in('status', ['active', 'upcoming'])
      .eq('classes.loc', 'Baildon')
      .eq('classes.day', 'Monday');
    expect(error).toBeNull();
    const expectedClassIds = new Set(data.map(b => b.class_id));
    const expectedCount    = expectedClassIds.size;
    expect(expectedCount).toBeGreaterThan(0);

    // Click Baildon first.
    await page.locator('#fg-baildon-card').click();
    await expect(page.locator('#filter-days-wrap')).toHaveClass(/on/);

    // The Monday day button should now exist in the day row.
    const mondayBtn = page.locator('#filter-row .fb', { hasText: 'Monday' });
    await expect(mondayBtn).toHaveCount(1);

    // Click Monday.
    await mondayBtn.click();
    await expect(mondayBtn).toHaveClass(/on/);

    // Grid shows exactly the Baildon Monday count.
    await expect(page.locator('#grid .card')).toHaveCount(expectedCount);

    // Every visible card must be Baildon AND Monday.
    const venues = await page.locator('#grid .card .card-loc').allTextContents();
    const days   = await page.locator('#grid .card .card-when-day').allTextContents();
    expect(venues.length).toBe(expectedCount);
    expect(days.length).toBe(expectedCount);
    for (const v of venues) expect(v).toContain('Baildon');
    for (const d of days)   expect(d).toBe('Monday');
  });
});
