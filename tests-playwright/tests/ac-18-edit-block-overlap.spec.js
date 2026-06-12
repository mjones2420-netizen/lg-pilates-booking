// AC-18 — Edit block — overlap validation also applies
// Verifies that saveEditBlock() applies the same overlap and same-day checks as
// saveNewBlock(). Changing an existing block's start date to overlap another block
// shows the overlap error in #ab-err and does NOT update the block.
//
// Setup: Create a per-run Saturday class + two blocks via direct pg (block A and block B
// that don't overlap). Open Edit Block for block B and change its start date to overlap
// block A. Expect the overlap error.
// Per-run class and both blocks deleted in afterEach.
//
// Saturday is used to avoid the fixture overlap check against Monday/Wednesday/Friday blocks.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

function toLocalISO(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

// Next Saturday on or after a given date
function nextWeekday(dayOfWeek, fromDate) {
  const d = new Date(fromDate);
  while (d.getDay() !== dayOfWeek) d.setDate(d.getDate() + 1);
  return d;
}

test.describe('AC-18 — Edit block overlap validation also applies', () => {

  let createdClassId = null;
  let blockAId = null;
  let blockBId = null;

  test.beforeEach(async () => {
    createdClassId = null;
    blockAId = null;
    blockBId = null;
  });

  test.afterEach(async () => {
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();
    if (blockAId) await pool.query('DELETE FROM blocks WHERE id = $1', [blockAId]);
    if (blockBId) await pool.query('DELETE FROM blocks WHERE id = $1', [blockBId]);
    if (createdClassId) await pool.query('DELETE FROM classes WHERE id = $1', [createdClassId]);
  });

  test('editing a block to overlap another block shows overlap error', async ({ page }) => {
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();

    // Create a Saturday class
    const classResult = await pool.query(`
      INSERT INTO classes (name, level, day, time, end_time, venue, loc)
      VALUES ('AC18 Test Class', 'Mixed Ability', 'Saturday', '9:00am', '9:45am', 'Test Venue', 'Test Loc')
      RETURNING id
    `);
    createdClassId = classResult.rows[0].id;

    // Block A: starts on a Saturday ~60 days out, runs 6 weeks
    const blockAStart = nextWeekday(6, new Date(Date.now() + 60 * 86400000));
    const blockAEnd = new Date(blockAStart);
    blockAEnd.setDate(blockAEnd.getDate() + 35); // 6 weeks
    const blockAStartStr = toLocalISO(blockAStart);
    const blockAEndStr = toLocalISO(blockAEnd);

    const blockAResult = await pool.query(`
      INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
      VALUES ($1, $2, $3, 6, ARRAY[]::text[], 60, 12, 0, true, 'upcoming')
      RETURNING id
    `, [createdClassId, blockAStartStr, blockAEndStr]);
    blockAId = blockAResult.rows[0].id;

    // Block B: starts the Saturday after Block A ends (non-overlapping)
    const blockBStart = nextWeekday(6, new Date(blockAEnd.getTime() + 7 * 86400000));
    const blockBEnd = new Date(blockBStart);
    blockBEnd.setDate(blockBEnd.getDate() + 35);
    const blockBStartStr = toLocalISO(blockBStart);
    const blockBEndStr = toLocalISO(blockBEnd);

    const blockBResult = await pool.query(`
      INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
      VALUES ($1, $2, $3, 6, ARRAY[]::text[], 60, 12, 0, true, 'upcoming')
      RETURNING id
    `, [createdClassId, blockBStartStr, blockBEndStr]);
    blockBId = blockBResult.rows[0].id;

    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);

    await loginAsAdmin(page);

    // Switch to By Class tab and expand the AC18 class group
    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();

    const groupHeader = page.locator(`[onclick="toggleClassGroup('cg-${createdClassId}')"]`);
    await expect(groupHeader).toBeVisible();
    await groupHeader.click();

    const groupBody = page.locator(`#cg-${createdClassId}`);
    await expect(groupBody).toBeVisible();

    // Click Edit Block on Block B
    const editBtnB = page.locator(`[onclick="openEditBlockModal(${blockBId})"]`);
    await expect(editBtnB).toBeVisible();
    await editBtnB.click();

    const modal = page.locator('#add-block-overlay');
    await expect(modal).toBeVisible();

    // Change Block B's start date to overlap Block A (start_date + 7 days = mid-block A)
    const overlapDate = new Date(blockAStart);
    overlapDate.setDate(overlapDate.getDate() + 7);
    const overlapDateStr = toLocalISO(overlapDate);

    await page.evaluate((dateStr) => {
      const el = document.getElementById('ab-start');
      el.value = dateStr;
      el.dispatchEvent(new Event('change'));
    }, overlapDateStr);

    await expect(page.locator('#ab-date-val')).toBeVisible();
    await expect(page.locator('#ab-date-val')).toContainText('confirmed');

    // Attempt to save
    await page.locator('#ab-btn').click();

    // Overlap error should appear
    const errEl = page.locator('#ab-err');
    await expect(errEl).toBeVisible();
    await expect(errEl).toContainText('These dates overlap with an existing block');

    // Modal stays open
    await expect(modal).toBeVisible();
  });

});
