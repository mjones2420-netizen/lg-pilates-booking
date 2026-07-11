// tests/ab-26-by-class-hides-past-blocks.spec.js
//
// AB (Admin Bookings) — By Class hides ended blocks.
// Covers scenario:
//   AB-26: The By Class page renders only current/upcoming blocks — ended
//          blocks never appear (their bookings live on Booking History).
//          A class whose blocks have ALL ended shows the redirect
//          empty-state message with a working + Add Block button.
//
// Mechanism (front-end):
//   renderClassesView() filters each class's blocks with !isBlockPast(b)
//   (live date maths on end_date — blocks.status is never consulted).
//
// Setup: the Friday class (fixture: fri-old-past + fri-recent-past +
// fri-upcoming) proves past blocks are dropped while upcoming survive.
// For the all-past empty state no fixture class qualifies, so this spec
// creates its own class + one ended block via pg and deletes both in
// afterEach (self-cleaning; no bookings are created so no cascade needed).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

/** First–last dates label as rendered on By Class block cards. */
function blockDatesLabel(block) {
  return `${block.dates[0]} – ${block.dates[block.dates.length - 1]}`;
}

test.describe('AB-26 — By Class hides past blocks', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  let tempClassId = null;

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner must be visible').toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (tempClassId !== null) {
      await getPool().query('DELETE FROM blocks WHERE class_id = $1', [tempClassId]);
      await getPool().query('DELETE FROM classes WHERE id = $1', [tempClassId]);
      tempClassId = null;
    }
  });

  test('AB-26a — ended blocks do not render; upcoming blocks do', async ({ page }) => {
    const friOldPast = await getBlockByRole('fri-old-past');
    const friRecentPast = await getBlockByRole('fri-recent-past');
    const friUpcoming = await getBlockByRole('fri-upcoming');

    await loginAsAdmin(page);
    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();

    const accordion = page.locator('#classes-accordion');
    const friGroup = accordion.locator('.class-group').filter({
      has: page.locator('.class-group-title', { hasText: /Friday/i })
    }).first();
    await expect(friGroup).toBeVisible({ timeout: 8000 });

    // Badge counts only non-past blocks (Friday fixture: 1 upcoming of 3 total)
    await expect(friGroup.locator('.class-group-badge')).toHaveText('1 block(s)');

    await friGroup.locator('.class-group-header').click();
    const friBody = friGroup.locator('.class-group-body');
    await expect(friBody).toBeVisible({ timeout: 5000 });

    // Upcoming block card renders; both ended blocks are absent entirely
    await expect(friBody.getByText(blockDatesLabel(friUpcoming)).first()).toBeVisible();
    await expect(friBody.getByText(blockDatesLabel(friOldPast))).toHaveCount(0);
    await expect(friBody.getByText(blockDatesLabel(friRecentPast))).toHaveCount(0);

    // No Archived badge anywhere on the page — past blocks never enter the render
    await expect(accordion.getByText('Archived')).toHaveCount(0);
  });

  test('AB-26b — class with only ended blocks shows redirect empty state', async ({ page }) => {
    // Create a class whose single block ended 3 weeks ago
    const pool = getPool();
    const clsRes = await pool.query(
      `INSERT INTO classes (name, day, time, venue, loc, level)
       VALUES ('History Only Test', 'Sunday', '09:00', 'Test Venue', 'Baildon', 'Mixed')
       RETURNING id`
    );
    tempClassId = clsRes.rows[0].id;
    await pool.query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
       VALUES ($1, (CURRENT_DATE - INTERVAL '9 weeks')::date, (CURRENT_DATE - INTERVAL '3 weeks')::date, 6,
               ARRAY['1 Jan','8 Jan','15 Jan','22 Jan','29 Jan','5 Feb'], 10, 8, 0, true, 'completed')`,
      [tempClassId]
    );

    // The classes global is fetched once at page load — reload so the page
    // sees the class created above.
    await page.reload();
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });

    await loginAsAdmin(page);
    await page.locator('#dbnav-byclass').click();

    const accordion = page.locator('#classes-accordion');
    const testGroup = accordion.locator('.class-group').filter({
      has: page.locator('.class-group-title', { hasText: 'History Only Test' })
    }).first();
    await expect(testGroup).toBeVisible({ timeout: 8000 });
    await expect(testGroup.locator('.class-group-badge')).toHaveText('0 block(s)');

    await testGroup.locator('.class-group-header').click();
    const body = testGroup.locator('.class-group-body');
    await expect(body).toBeVisible({ timeout: 5000 });

    // The approved Option 2 wording, with a working + Add Block button
    await expect(body.locator('.class-group-empty')).toContainText(
      'No current or upcoming blocks — see Booking history for past terms.'
    );
    await body.locator('button', { hasText: '+ Add Block' }).click();
    await expect(page.locator('#add-block-overlay.on')).toBeVisible({ timeout: 5000 });
  });
});
