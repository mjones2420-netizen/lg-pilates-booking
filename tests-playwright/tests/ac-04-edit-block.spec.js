// ac-04-edit-block.spec.js
//
// AC-04: Edit a block
//
// Verifies that an admin can edit an existing block via the "Edit Block"
// button in the By Class tab. Changed price and capacity should be reflected
// in the By Class tab immediately after saving.
//
// Uses a Saturday class (no fixture blocks on Saturday — avoids overlap check).
// Class + block inserted via direct pg before goto so app loads them into memory.
// Date formatting note: toLocalISO() avoids BST-midnight UTC shift.

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

function futureSaturday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysToSat = day === 6 ? 7 : 6 - day;
  d.setDate(d.getDate() + daysToSat + 14);
  return toLocalISO(d);
}

test.describe('AC-04 — Edit a block', () => {
  let createdClassId = null;
  const className = `AC04 Test ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    const startDate = futureSaturday();
    // end_date = start + 35 days (6 weeks - 1)
    const endD = new Date(startDate + 'T12:00:00'); // noon avoids any DST midnight edge
    endD.setDate(endD.getDate() + 35);
    const endDate = toLocalISO(endD);

    const { rows: cr } = await getPool().query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, $1, 'Saturday', '10:00am', '10:45am', 'Test Venue', 'Guiseley')
       RETURNING id`,
      [className]
    );
    createdClassId = cr[0].id;

    await getPool().query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, $2, $3, 6, ARRAY[]::text[], 8, 10, 0, 0, true, 'upcoming')`,
      [createdClassId, startDate, endDate]
    );

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

  test('updated price and capacity shown in By Class tab after save', async ({ page }) => {
    await page.locator('#tab-classes').click();
    await expect(page.locator('#tab-classes.on')).toBeVisible();

    const header = page.locator('.class-group-header').filter({ hasText: className });
    await expect(header).toBeVisible({ timeout: 5000 });
    await header.click();
    const groupBody = page.locator(`#cg-${createdClassId}`);
    await expect(groupBody).toBeVisible();

    await groupBody.getByRole('button', { name: 'Edit Block' }).click();
    await expect(page.locator('#add-block-overlay.on')).toBeVisible();

    // openEditBlockModal pre-fills #ab-start. Re-fire onchange via evaluate
    // so validateAbDate() confirms the day before saveEditBlock runs.
    const existingStart = await page.locator('#ab-start').inputValue();
    await page.locator('#ab-start').evaluate((el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, existingStart);
    await expect(page.locator('#ab-date-val')).toContainText('Saturday confirmed');

    await page.locator('#ab-price').fill('15');
    await page.locator('#ab-cap').fill('8');
    await page.locator('#ab-btn').click();

    await expect(page.locator('#toastEl')).toContainText('Block updated!');
    await expect(page.locator('#add-block-overlay.on')).not.toBeVisible();

    if (!(await groupBody.isVisible())) {
      await header.click();
      await expect(groupBody).toBeVisible();
    }
    await expect(groupBody).toContainText('£15/session');
    await expect(groupBody).toContainText('8');
  });
});
