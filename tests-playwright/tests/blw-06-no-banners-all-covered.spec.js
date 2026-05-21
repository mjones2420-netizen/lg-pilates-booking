// tests/blw-06-no-banners-all-covered.spec.js
//
// BLW (Block Warnings) — BLW-06: No warning banners appear when all classes
// have adequate block coverage.
//
// Excel scenario BLW-06: "No banners shown when all classes are covered"
//   Given: Admin is logged in
//   When:  All classes have at least two visible active/upcoming blocks
//   Then:  #block-warnings is hidden (display:none, no content rendered)
//
// Mechanism (front-end):
//   renderBlockWarnings() returns early with el.style.display="none" when
//   hidden.length===0 && expiring.length===0.
//
// Fixture note:
//   In the clean fixture, Wednesday and Friday each have only ONE visible
//   block (wed-upcoming and fri-upcoming respectively), so the yellow
//   advisory already fires for both. This test must give them a second
//   block to fully cover them.
//
// Setup strategy:
//   Insert a second upcoming block for Wed (class_id=2) and Fri (class_id=3)
//   via direct SQL, positioned ~400 days out (well beyond any existing blocks,
//   avoiding overlap validation). Assert no banner. afterEach deletes them.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const WED_CLASS_ID = 2;
const FRI_CLASS_ID = 3;

/**
 * Returns a date N days from today on the given weekday (0=Sun … 6=Sat),
 * formatted as YYYY-MM-DD. Starts from minDaysAhead and walks forward.
 */
function futureDateOnWeekday(weekday, minDaysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + minDaysAhead);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() + 1);
  }
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function addWeeks(dateStr, weeks) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + (weeks - 1) * 7);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

test.describe('BLW-06 — No banners when all classes are covered', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — BLW specs require the app to be served.');
  test.skip(!ADMIN_PASSWORD, 'TEST_ADMIN_PASSWORD not set — admin specs require admin credentials.');

  let insertedStartDates = [];

  test.beforeEach(async ({ page }) => {
    insertedStartDates = [];
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Delete any blocks we inserted, identified by class_id + start_date.
    for (const { classId, startDate } of insertedStartDates) {
      await getPool().query(
        `DELETE FROM blocks WHERE class_id = $1 AND start_date = $2`,
        [classId, startDate]
      );
    }
  });

  test('no warning banners shown when all classes have two or more visible blocks', async ({ page }) => {
    // Give Wednesday a second upcoming block (~400 days out, Wednesday).
    const wedStart = futureDateOnWeekday(3, 400); // 3 = Wednesday
    const wedEnd = addWeeks(wedStart, 6);
    await getPool().query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, $2, $3, 6, ARRAY[]::text[], 10, 12, 0, 0, true, 'upcoming')`,
      [WED_CLASS_ID, wedStart, wedEnd]
    );
    insertedStartDates.push({ classId: WED_CLASS_ID, startDate: wedStart });

    // Give Friday a second upcoming block (~400 days out, Friday).
    const friStart = futureDateOnWeekday(5, 400); // 5 = Friday
    const friEnd = addWeeks(friStart, 6);
    await getPool().query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, $2, $3, 6, ARRAY[]::text[], 10, 12, 0, 0, true, 'upcoming')`,
      [FRI_CLASS_ID, friStart, friEnd]
    );
    insertedStartDates.push({ classId: FRI_CLASS_ID, startDate: friStart });

    await loginAsAdmin(page);

    // Wait for the dashboard to finish rendering.
    await expect(page.locator('#ctbody tr').first()).toBeVisible({ timeout: 10000 });

    // #block-warnings must be hidden — display:none means no warnings exist.
    await expect(page.locator('#block-warnings')).not.toBeVisible();

    await signOutAdmin(page);
  });
});
