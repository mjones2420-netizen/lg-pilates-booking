// ac-02-add-block-to-class.spec.js
//
// AC-02: Add a block to a class
//
// Verifies that an admin can add a block to an existing class via the
// "+ Block" button in the Upcoming Classes section. After saving, the
// block should appear in the By Class tab accordion, and the class should
// become visible on the public booking page.
//
// Uses a Saturday class (no fixture blocks on Saturday — avoids overlap check).
// Setup: creates class via direct pg before goto so app loads it into memory.
// Cleanup: afterEach deletes class (blocks cascade).
//
// Date formatting note: toLocalISO() formats using local year/month/date rather
// than toISOString() which converts to UTC — in BST this shifts midnight dates
// one day back, causing validateAbDate() to see the wrong day of the week.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

function toLocalISO(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

// Returns a Saturday 2+ weeks in the future as YYYY-MM-DD (local time)
function futureSaturday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun...6=Sat
  const daysToSat = day === 6 ? 7 : 6 - day;
  d.setDate(d.getDate() + daysToSat + 7);
  return toLocalISO(d);
}

test.describe('AC-02 — Add a block to a class', () => {
  let createdClassId = null;
  const className = `AC02 Test ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    const { rows } = await getPool().query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, $1, 'Saturday', '9:00am', '9:45am', 'Test Venue', 'Baildon')
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
      await getPool().query('DELETE FROM blocks WHERE class_id = $1', [createdClassId]);
      await getPool().query('DELETE FROM classes WHERE id = $1', [createdClassId]);
    }
  });

  test('block appears in By Class tab and class becomes visible on schedule', async ({ page }) => {
    const startDate = futureSaturday();

    // Navigate to Classes page
    await page.locator('#dbnav-classes').click();
    await expect(page.locator('#dbnav-classes.on')).toBeVisible();

    const ctRow = page.locator('#ctbody tr').filter({ hasText: className });
    await expect(ctRow).toBeVisible({ timeout: 5000 });
    await ctRow.getByRole('button', { name: '+ Block' }).click();

    await expect(page.locator('#add-block-overlay.on')).toBeVisible();

    // Set date via evaluate so onchange fires with the correct value in page context
    await page.locator('#ab-start').evaluate((el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, startDate);

    await expect(page.locator('#ab-date-val')).toContainText('Saturday confirmed');

    await page.locator('#ab-weeks').selectOption('6');
    await page.locator('#ab-price').fill('10');
    await page.locator('#ab-cap').fill('12');

    await page.locator('#ab-btn').click();

    await expect(page.locator('#toastEl')).toContainText('Block added!');
    await expect(page.locator('#add-block-overlay.on')).not.toBeVisible();

    // Verify block was saved to DB
    const { rows: blockRows } = await getPool().query(
      'SELECT id FROM blocks WHERE class_id = $1', [createdClassId]
    );
    expect(blockRows.length).toBe(1);

    // Block appears in By Class tab accordion — reload page so app re-fetches from DB
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await loginAsAdmin(page);
    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();

    await page.locator(`[onclick="toggleClassGroup('cg-${createdClassId}')"]`).click();
    const groupBody = page.locator(`#cg-${createdClassId}`);
    await expect(groupBody).toBeVisible({ timeout: 5000 });
    await expect(groupBody.getByRole('button', { name: 'Edit Block' })).toBeVisible({ timeout: 5000 });

    // Class is now visible on the public booking page
    await page.locator('#nb-schedule').click();
    await expect(page.locator('#pg-schedule.on')).toBeVisible();
    await expect(page.locator('.card').filter({ hasText: className })).toBeVisible({ timeout: 5000 });
  });
});
