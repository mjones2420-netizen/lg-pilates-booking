// ac-08-class-hidden-no-blocks.spec.js
//
// AC-08: Class hidden when it has no blocks
//
// Verifies that a class with no visible/active blocks does not appear on
// the public booking page. After its only block is deleted, a page reload
// should show no card for that class.
//
// Note: this scenario overlaps with the final state of AC-05 (delete block
// leaves class with no blocks → class hidden). AC-08 provides a dedicated
// spec with an explicit schedule reload assertion so the behaviour is
// independently verified.
//
// Uses a fresh class + block per-run. The block is deleted as part of the
// test. afterEach cleans up the class itself (block already gone).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

function futureThursday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysUntil = day <= 4 ? 4 - day : 11 - day;
  d.setDate(d.getDate() + daysUntil + 35); // +35 to stay clear of thu-locked fixture
  return d.toISOString().split('T')[0];
}

test.describe('AC-08 — Class hidden when it has no blocks', () => {
  let createdClassId = null;
  const className = `AC08 Test ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    const startDate = futureThursday();
    const end = new Date(startDate + 'T00:00:00');
    end.setDate(end.getDate() + 35);
    const endDate = end.toISOString().split('T')[0];

    const { rows: cr } = await getPool().query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, $1, 'Thursday', '5:00pm', '5:45pm', 'Test Venue', 'Baildon')
       RETURNING id`,
      [className]
    );
    createdClassId = cr[0].id;

    await getPool().query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, $2, $3, 6, ARRAY[]::text[], 10, 12, 0, 0, true, 'upcoming')`,
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

  test('class absent from public schedule after its only block is deleted', async ({ page }) => {
    // Verify class IS visible on the schedule before deletion
    await page.locator('#nb-schedule').click();
    await expect(page.locator('#pg-schedule.on')).toBeVisible();
    await expect(page.locator('.card').filter({ hasText: className })).toBeVisible({ timeout: 5000 });

    // Go to dashboard and delete the block
    await page.locator('#nb-dashboard').click();
    await expect(page.locator('#pg-dashboard.on')).toBeVisible();
    await page.locator('#tab-classes').click();
    await expect(page.locator('#tab-classes.on')).toBeVisible();

    const header = page.locator('.class-group-header').filter({ hasText: className });
    await expect(header).toBeVisible({ timeout: 5000 });
    await header.click();
    const groupBody = page.locator(`#cg-${createdClassId}`);
    await expect(groupBody).toBeVisible();

    page.once('dialog', d => d.accept());
    await groupBody.getByRole('button', { name: 'Delete Block' }).click();
    await expect(page.locator('#toastEl')).toContainText('Block deleted.');

    // Reload the public schedule
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await expect(page.locator('#pg-schedule.on')).toBeVisible();

    // Class card should NOT appear — no blocks means not rendered
    await page.locator('.card').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await expect(page.locator('.card').filter({ hasText: className })).not.toBeVisible();
  });
});
