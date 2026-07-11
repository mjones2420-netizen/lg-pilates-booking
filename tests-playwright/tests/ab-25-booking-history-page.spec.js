// tests/ab-25-booking-history-page.spec.js
//
// AB (Admin Bookings) — Booking History page.
// Covers scenario:
//   AB-25: Bookings on ended blocks appear on the Booking History page
//          (view-only) and no longer on All Bookings; History has its own
//          working search box; nothing is deleted — the data is identical,
//          just relocated.
//
// Mechanism (front-end):
//   renderDashboard() splits booking rows by isBlockPast(block) — computed
//   live from end_date, never from blocks.status. Past rows render into
//   #historytbody with a View button only; current/upcoming rows render
//   into #btbody with the full action set.
//
// Read-only spec — uses seeded fixture data (mon-past carries confirmed
// bookings for Returning One and Returning Two), no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;

/** "3 Feb – 24 Mar" — the Block column text renderDashboard builds from blk.dates. */
function blockDatesLabel(block) {
  return `${block.dates[0]} – ${block.dates[block.dates.length - 1]}`;
}

test.describe('AB-25 — Booking History page', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner must be visible').toBeVisible({ timeout: 5000 });
  });

  test('AB-25a — past-block bookings appear on History (not All Bookings), view-only', async ({ page }) => {
    const monPast = await getBlockByRole('mon-past');
    const monCurrent = await getBlockByRole('mon-current');
    const pastLabel = blockDatesLabel(monPast);
    const currentLabel = blockDatesLabel(monCurrent);

    await loginAsAdmin(page);

    // All Bookings: wait for render, then confirm the mon-past block's rows are gone
    const btbody = page.locator('#btbody');
    await expect(btbody.locator('tr').first()).not.toContainText('Loading...', { timeout: 10000 });
    await expect(btbody.locator('tr', { hasText: currentLabel }).first()).toBeVisible();
    await expect(btbody.locator('tr', { hasText: pastLabel })).toHaveCount(0);

    // Switch to Booking History via the new sidebar item
    await page.locator('#dbnav-history').click();
    await expect(page.locator('#dbnav-history.on')).toBeVisible();
    await expect(page.locator('#dbpage-history.on')).toBeVisible();

    // History holds the mon-past bookings (fixture: Returning One + Returning Two)
    const historyBody = page.locator('#historytbody');
    const pastRows = historyBody.locator('tr', { hasText: pastLabel });
    await expect(pastRows.first()).toBeVisible({ timeout: 5000 });
    await expect(pastRows).toHaveCount(2);
    await expect(historyBody.locator('tr', { hasText: 'Returning One' }).first()).toBeVisible();

    // ...and no current-block rows leaked in
    await expect(historyBody.locator('tr', { hasText: currentLabel })).toHaveCount(0);

    // History rows are view-only: View present; Confirm / Remove from Block /
    // Del Customer absent everywhere in the table
    const firstPastRow = pastRows.first();
    await expect(firstPastRow.locator('button', { hasText: 'View' })).toBeVisible();
    await expect(historyBody.locator('button', { hasText: 'Remove from Block' })).toHaveCount(0);
    await expect(historyBody.locator('button', { hasText: 'Del Customer' })).toHaveCount(0);
    await expect(historyBody.locator('button', { hasText: 'Confirm' })).toHaveCount(0);

    // Data intact, not deleted: the row still shows the paid amount and a status pill
    await expect(firstPastRow.locator('.pill')).toBeVisible();
    await expect(firstPastRow).toContainText('£60');

    // View still works from History (modal opens with the client's name)
    await firstPastRow.locator('button', { hasText: 'View' }).click();
    await expect(page.locator('#view-overlay.on')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#view-title')).toContainText('Returning');
  });

  test('AB-25b — History search box filters rows', async ({ page }) => {
    const monPast = await getBlockByRole('mon-past');
    const pastLabel = blockDatesLabel(monPast);

    await loginAsAdmin(page);
    await page.locator('#dbnav-history').click();
    await expect(page.locator('#dbpage-history.on')).toBeVisible();

    const historyBody = page.locator('#historytbody');
    await expect(historyBody.locator('tr', { hasText: pastLabel }).first()).toBeVisible({ timeout: 10000 });

    // Search by an email unique to one fixture customer
    await page.locator('#history-search').fill('returning-two@test.example');

    // Returning Two's rows stay visible; Returning One's are display:none'd
    await expect(historyBody.locator('tr:visible', { hasText: 'Returning Two' }).first()).toBeVisible();
    await expect(historyBody.locator('tr:visible', { hasText: 'Returning One' })).toHaveCount(0);
    await expect(page.locator('#history-result-count')).toContainText('matched');

    // Clearing the search restores all rows
    await page.locator('#history-search').fill('');
    await expect(historyBody.locator('tr:visible', { hasText: 'Returning One' }).first()).toBeVisible();
    await expect(page.locator('#history-result-count')).toHaveText('');
  });
});
