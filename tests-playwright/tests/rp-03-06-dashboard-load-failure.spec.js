// RP-03 to RP-06 — Dashboard load failures and overlapping loads (#125)
// Reports, Catch-ups and Waiting lists draw from the dashboard's one shared
// load (bookings, client names, swaps). Before #125 a failed load still
// "succeeded", so those pages showed £0 / "Unknown" as if real, and an older
// load finishing late could put stale figures back over a newer one.
//
// RP-03 to RP-05 fail the dashboard's customers query in the browser (as a
// signal drop would) and check each page shows its "Error loading" state
// instead of figures. RP-06 overlaps two loads: the first is held back and
// answered with an empty bookings list after the second has finished, and
// must not overwrite it.
//
// Read-only against the test DB: requests are aborted or faked in the browser,
// nothing is written, so there is nothing to clean up.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');

// Matches the dashboard's own query for `table` (select= starting with
// `selectPrefix`), as helpers/hold-request.js does, so other queries on that table go through.
function dashQuery(table, selectPrefix) {
  return (url) =>
    url.pathname.endsWith(`/rest/v1/${table}`) &&
    (url.searchParams.get('select') || '').startsWith(selectPrefix);
}

async function loginWithCustomersFailing(page) {
  await page.route(dashQuery('customers', 'id,first_name,last_name,email,phone,customer_type'),
    (route) => route.abort());
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
  await loginAsAdmin(page);
  // The dashboard itself reports the failure on All bookings.
  await expect(page.locator('#btbody')).toContainText('Error loading. Please refresh.');
}

test.describe('RP-03 to RP-06 — Dashboard load failures (#125)', () => {
  test.beforeEach(() => {
    test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');
  });

  test('RP-03 — Reports shows an error, not £0, when the dashboard load fails', async ({ page }) => {
    await loginWithCustomersFailing(page);

    await page.locator('#dbnav-reports').click();
    await expect(page.locator('#dbnav-reports.on')).toBeVisible();

    await expect(page.locator('#rpt-error')).toBeVisible();
    await expect(page.locator('#rpt-error')).toHaveText('Error loading reports. Please refresh.');
    // The figures are hidden so a £0 can't pass as real.
    await expect(page.locator('#rpt-revenue-mtd')).toBeHidden();
    await expect(page.locator('#rpt-active-bookings')).toBeHidden();
    await expect(page.locator('#rpt-class-totals')).toBeHidden();
  });

  test('RP-04 — Catch-ups shows an error and Record swap does not open its form', async ({ page }) => {
    await loginWithCustomersFailing(page);

    await page.locator('#dbnav-catchup').click();
    await expect(page.locator('#catchup-list')).toContainText('Error loading catch-up swaps. Please refresh.');

    await page.locator('#dbpage-catchup button', { hasText: '+ Record swap' }).click();
    await page.waitForTimeout(500); // room for the form to open, if it would
    await expect(page.locator('#catchup-overlay')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#catchup-list')).toContainText('Error loading catch-up swaps. Please refresh.');
  });

  test('RP-05 — Waiting lists shows an error when the dashboard load fails', async ({ page }) => {
    await loginWithCustomersFailing(page);

    await page.locator('#dbnav-waitlist').click();
    await expect(page.locator('#waitlist-list')).toContainText('Error loading waiting lists. Please refresh.');
    await expect(page.locator('#waitlist-subtitle')).toHaveText('Could not load');
  });

  test('RP-06 — an older dashboard load finishing late does not overwrite a newer one', async ({ page }) => {
    // The first dashboard bookings query (the one login starts) is held, then
    // answered with an empty list standing in for out-of-date data. Later
    // bookings queries go straight through.
    let releaseFirst = null;
    let seen = 0;
    await page.route(dashQuery('bookings', 'id,status,amount_due'), async (route) => {
      seen++;
      if (seen > 1) return route.continue();
      await new Promise((resolve) => { releaseFirst = resolve; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Start a second, newer load while the first is still held.
    await expect.poll(() => releaseFirst !== null).toBe(true);
    await page.evaluate(() => renderDashboard());

    // The newer load draws the real bookings.
    const viewButtons = page.locator('#btbody button', { hasText: 'View' });
    await expect(viewButtons.first()).toBeVisible({ timeout: 15000 });
    const realCount = await viewButtons.count();

    // Now the older load finishes, with its empty list. It must be ignored.
    releaseFirst();
    await page.waitForTimeout(1500); // room for the stale load to draw, if it would
    await expect(page.locator('#btbody')).not.toContainText('No bookings yet.');
    await expect(viewButtons).toHaveCount(realCount);

    // Reports draws from the newer load's bookings too.
    await page.locator('#dbnav-reports').click();
    await expect(page.locator('#rpt-revenue-month')).not.toHaveText('');
    await expect(page.locator('#rpt-active-bookings')).not.toHaveText('0');
  });
});
