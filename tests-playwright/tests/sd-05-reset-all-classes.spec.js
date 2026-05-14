/**
 * SD-05 — Reset to All Classes
 *
 * Starts by applying a Baildon filter, then clicks "All Classes" to reset.
 * Asserts that all classes are visible again AND that the day buttons row
 * is hidden (per Excel SD-05 expected result: "Day buttons hidden").
 *
 * No DB state created.
 */

const { test, expect } = require('@playwright/test');
const { APP_PATH }     = require('./helpers/app-url');
const { sb }           = require('./helpers/supabase');

test.describe('SD-05 — Reset to All Classes', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('clicking All Classes after a filter restores full grid and hides day buttons', async ({ page }) => {
    // Expected count of all classes with a visible block.
    const { data, error } = await sb
      .from('blocks')
      .select('class_id')
      .in('status', ['active', 'upcoming']);
    expect(error).toBeNull();
    const expectedClassIds = new Set(data.map(b => b.class_id));
    const expectedTotal    = expectedClassIds.size;
    expect(expectedTotal).toBeGreaterThan(0);

    // Apply Baildon filter first.
    await page.locator('#fg-baildon-card').click();
    await expect(page.locator('#filter-days-wrap')).toHaveClass(/on/);
    await expect(page.locator('#fg-baildon-card')).toHaveClass(/on/);

    // Click "All Classes" to reset.
    await page.locator('#fb-all').click();

    // "All Classes" is the active pill again.
    await expect(page.locator('#fb-all')).toHaveClass(/on/);
    // Baildon pill is no longer active.
    await expect(page.locator('#fg-baildon-card')).not.toHaveClass(/on/);

    // Day buttons row is hidden again (.filter-days-wrap without .on = display:none).
    await expect(page.locator('#filter-days-wrap')).not.toHaveClass(/on/);
    await expect(page.locator('#filter-days-wrap')).toBeHidden();

    // Grid shows all classes again.
    await expect(page.locator('#grid .card')).toHaveCount(expectedTotal);
  });
});
