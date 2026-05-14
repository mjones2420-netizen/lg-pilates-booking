/**
 * SD-01 — All classes load on page open
 *
 * Loads the public booking page with no filter applied and asserts that
 * every class with at least one active or upcoming block renders a card.
 *
 * Mechanism:
 *   - Query the test DB for the set of class IDs that have an active or
 *     upcoming block (this is what renderGrid() filters on at line ~962 of
 *     index.html).
 *   - Assert that #grid .card has the same count.
 *   - Assert that #fb-all is in the "on" state on page load.
 *
 * No DB state created — pure read-only UI test.
 */

const { test, expect } = require('@playwright/test');
const { APP_PATH }     = require('./helpers/app-url');
const { sb }           = require('./helpers/supabase');

test.describe('SD-01 — All classes load on page open', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    // Second line of defence — fail loud if the env switch didn't fire.
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('grid renders one card per class with an active or upcoming block', async ({ page }) => {
    // Query the DB for the expected set of visible class IDs.
    const { data, error } = await sb
      .from('blocks')
      .select('class_id')
      .in('status', ['active', 'upcoming']);
    expect(error).toBeNull();
    const expectedClassIds = new Set(data.map(b => b.class_id));
    const expectedCount    = expectedClassIds.size;
    expect(expectedCount).toBeGreaterThan(0);

    // "All Classes" pill should be active by default on page load.
    await expect(page.locator('#fb-all')).toHaveClass(/on/);

    // Grid should render exactly one card per class.
    await expect(page.locator('#grid .card')).toHaveCount(expectedCount);

    // No empty-state message should be present.
    await expect(page.locator('#grid .no-filter-msg')).toHaveCount(0);
  });
});
