// AC-15 — Red warning banner — Add Block does NOT prefill date
// Verifies that clicking "+ Add Block" from the red (hidden) warning banner leaves the
// Block Start Date field EMPTY — there is no active block to derive a date from.
//
// Setup: Insert a per-run class with no blocks via direct pg so it appears in the red
// banner. Click its "+ Add Block" button and assert #ab-start is empty.
// The per-run class is deleted in afterEach.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

test.describe('AC-15 — Red warning banner Add Block does NOT prefill date', () => {

  let createdClassId = null;
  const CLASS_NAME = 'AC15 Test Class';

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

  test('red banner Add Block opens modal with empty start date field', async ({ page }) => {
    // Insert a per-run blockless class — triggers the red warning banner
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();
    const result = await pool.query(`
      INSERT INTO classes (name, level, day, time, end_time, venue, loc)
      VALUES ($1, 'Mixed Ability', 'Thursday', '7:00pm', '7:45pm', 'Test Venue', 'Test Loc')
      RETURNING id
    `, [CLASS_NAME]);
    createdClassId = result.rows[0].id;

    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);

    await loginAsAdmin(page);

    const warnings = page.locator('#block-warnings');
    await expect(warnings).toBeVisible();

    // Red banner: title contains "no active or upcoming block"
    const redBanner = warnings.locator('.block-warning', {
      hasText: 'no active or upcoming block'
    }).first();
    await expect(redBanner).toBeVisible();

    // Find the "+ Add Block" button for our per-run class
    const classRow = redBanner.locator('.block-warning-row', { hasText: CLASS_NAME });
    await expect(classRow).toBeVisible();
    const addBlockBtn = classRow.locator('button', { hasText: '+ Add Block' });
    await addBlockBtn.click();

    const modal = page.locator('#add-block-overlay');
    await expect(modal).toBeVisible();

    // Start date field should be EMPTY — no prefill from red banner
    const startField = page.locator('#ab-start');
    await expect(startField).toHaveValue('');

    // Day validation element should be hidden (no date entered yet)
    const dateVal = page.locator('#ab-date-val');
    await expect(dateVal).toBeHidden();
  });

});
