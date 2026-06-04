// AC-12 — Warning banner shows class time in name
// Verifies that both the red (hidden) and yellow (advisory) warning banners include the
// class time alongside the class name, e.g. "Mixed Ability — Monday 9:45am".
//
// Setup:
//   - Red banner: insert a per-run class with no blocks via direct pg (triggers hidden banner)
//   - Yellow banner: the clean fixture already puts Wed and Fri in the advisory state
//     (each has exactly 1 visible non-expired block). Use Wednesday as the known target.
//
// The per-run class is deleted in afterEach.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

test.describe('AC-12 — Warning banner shows class time in name', () => {

  let createdClassId = null;

  test.beforeEach(async () => {
    createdClassId = null;
  });

  test.afterEach(async () => {
    if (createdClassId) {
      const { getPool } = require('./helpers/admin-db');
      const pool = getPool();
      await pool.query('DELETE FROM classes WHERE id = $1', [createdClassId]);
      createdClassId = null;
    }
  });

  test('red and yellow banners both show class name including day and time', async ({ page }) => {
    // Insert a per-run class with no blocks — this will appear in the red (hidden) banner
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();
    const result = await pool.query(`
      INSERT INTO classes (name, level, day, time, end_time, venue, loc)
      VALUES ('AC12 Test Class', 'Mixed Ability', 'Tuesday', '8:00am', '8:45am', 'Test Venue', 'Test Loc')
      RETURNING id
    `);
    createdClassId = result.rows[0].id;

    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);

    await loginAsAdmin(page);

    // Block warnings section should be visible
    const warnings = page.locator('#block-warnings');
    await expect(warnings).toBeVisible();

    // Red banner: our per-run class should appear with its time
    const redBanner = warnings.locator('.block-warning').first();
    await expect(redBanner).toBeVisible();
    const redClassEntry = redBanner.locator('.block-warning-class', { hasText: 'AC12 Test Class' });
    await expect(redClassEntry).toBeVisible();
    await expect(redClassEntry).toContainText('Tuesday');
    await expect(redClassEntry).toContainText('8:00am');

    // Yellow advisory banner: Wednesday class should appear (1 visible block in clean fixture)
    // The advisory is the second .block-warning (or it may be the only one if red is absent,
    // but we just inserted a red-trigger class so both should be present).
    const yellowBanner = warnings.locator('.block-warning').nth(1);
    await expect(yellowBanner).toBeVisible();
    const yellowClassEntry = yellowBanner.locator('.block-warning-class').first();
    await expect(yellowClassEntry).toBeVisible();
    // Yellow entries show "Name — Day Time" format — just confirm the format is present
    await expect(yellowClassEntry).toContainText('\u2014'); // em dash separator
    // The text should contain a time pattern (digits followed by am or pm)
    const yellowText = await yellowClassEntry.textContent();
    expect(yellowText).toMatch(/\d+:\d+(am|pm)/);
  });

});
