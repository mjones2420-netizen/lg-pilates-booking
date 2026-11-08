// RP-07 and RP-08 — "Try again" on dashboard load errors (#93)
// The dashboard's "Error loading" messages carry a Try again button that
// reloads the dashboard data and redraws the open page, so Louise doesn't
// have to refresh the browser.
//
// The dashboard's customers query is aborted in the browser until the test
// lets it through. Read-only against the test DB — nothing to clean up.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');

function dashCustomersQuery(url) {
  return url.pathname.endsWith('/rest/v1/customers') &&
    (url.searchParams.get('select') || '').startsWith('id,first_name,last_name,email,phone,customer_type');
}

async function loginWhileFailing(page, state) {
  await page.route(dashCustomersQuery, (route) => (state.failing ? route.abort() : route.continue()));
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
  await loginAsAdmin(page);
  await expect(page.locator('#btbody')).toContainText('Error loading.');
}

test.describe('RP-07 and RP-08 — dashboard Try again (#93)', () => {
  test.beforeEach(() => {
    test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');
  });

  test('RP-07 — Try again on All bookings reloads the bookings', async ({ page }) => {
    const state = { failing: true };
    await loginWhileFailing(page, state);

    state.failing = false;
    await page.locator('#btbody .dash-retry-btn').click();
    await expect(page.locator('#btbody button', { hasText: 'View' }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#btbody')).not.toContainText('Error loading');
    await expect(page.locator('#dbnav-bookings.on')).toBeVisible();
  });

  test('RP-08 — Try again on Waiting lists reloads that page', async ({ page }) => {
    const state = { failing: true };
    await loginWhileFailing(page, state);

    await page.locator('#dbnav-waitlist').click();
    await expect(page.locator('#waitlist-list')).toContainText('Error loading waiting lists.');

    state.failing = false;
    await page.locator('#waitlist-list .dash-retry-btn').click();
    await expect(page.locator('#waitlist-subtitle')).not.toHaveText('Could not load', { timeout: 15000 });
    await expect(page.locator('#waitlist-list')).not.toContainText('Error loading');
    await expect(page.locator('#dbnav-waitlist.on')).toBeVisible();
  });
});
