// ac-25-class-time-picker-legacy-minutes.spec.js
//
// AC-25: Class time dropdown picker preserves legacy odd-minute times (#5)
//
// The Add/Edit Class time fields are now Hour / Minutes / am-pm dropdowns
// (minutes in 5-minute steps). Storage is unchanged — times are still saved as
// "9:45am". Most classes fall on 5-minute boundaries, but a class created
// before this change could hold an odd minute like "9:47am". setClassTimePicker
// injects that exact value as an option so opening such a class for edit never
// silently rounds or loses the stored time.
//
// This spec seeds a class with "9:47am" / "10:32am", opens Edit, and asserts the
// dropdowns show the injected odd minutes — then saves with no change and
// confirms the stored time is untouched.
//
// Cleanup: afterEach deletes the seeded class.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

test.describe('AC-25 — class time picker preserves legacy odd-minute times', () => {
  let createdClassId = null;
  const className = `AC25 Test ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    const { rows } = await getPool().query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, $1, 'Monday', '9:47am', '10:32am', 'Legacy Venue', 'Baildon')
       RETURNING id`,
      [className]
    );
    createdClassId = rows[0].id;

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await loginAsAdmin(page);
  });

  test.afterEach(async () => {
    if (createdClassId) {
      await getPool().query('DELETE FROM classes WHERE id = $1', [createdClassId]);
    }
  });

  test('edit populates odd minutes and saving unchanged preserves the stored time', async ({ page }) => {
    await page.locator('#dbnav-classes').click();
    await expect(page.locator('#dbnav-classes.on')).toBeVisible();

    const ctRow = page.locator('#ctbody tr').filter({ hasText: className });
    await expect(ctRow).toBeVisible({ timeout: 5000 });
    await ctRow.getByRole('button', { name: 'Edit' }).click();

    await expect(page.locator('#add-class-overlay.on')).toBeVisible();

    // The odd minutes (47 / 32) are not 5-minute steps — they must have been
    // injected as options and selected, not rounded away.
    await expect(page.locator('#ac-time-h')).toHaveValue('9');
    await expect(page.locator('#ac-time-m')).toHaveValue('47');
    await expect(page.locator('#ac-time-ap')).toHaveValue('am');
    await expect(page.locator('#ac-end-h')).toHaveValue('10');
    await expect(page.locator('#ac-end-m')).toHaveValue('32');
    await expect(page.locator('#ac-end-ap')).toHaveValue('am');

    // Save with no change — the stored odd-minute time must be untouched.
    await page.locator('#ac-btn').click();
    await expect(page.locator('#toastEl')).toContainText('Class updated!');

    const { rows } = await getPool().query(
      'SELECT time, end_time FROM classes WHERE id = $1', [createdClassId]);
    expect(rows[0].time).toBe('9:47am');
    expect(rows[0].end_time).toBe('10:32am');
  });
});
