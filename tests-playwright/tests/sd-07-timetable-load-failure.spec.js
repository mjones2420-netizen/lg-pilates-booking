/**
 * SD-07 — Timetable load failure shows "couldn't load" + Try again (#93)
 *
 * Before #93 a failed classes/blocks load was swallowed and customers saw
 * "No classes available — check back soon!", which is false. Now the grid
 * shows "We couldn't load the timetable" with a Try again button that
 * reloads the timetable in place.
 *
 * Mechanism: the page's classes query is aborted in the browser (as a signal
 * drop would) until the test lets it through, then Try again is clicked.
 *
 * Read-only against the test DB — nothing written, nothing to clean up.
 */

const { test, expect } = require('@playwright/test');
const { APP_PATH }     = require('./helpers/app-url');

test.describe('SD-07 — Timetable load failure (#93)', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  test('failed load shows Try again, not "No classes available", and Try again recovers', async ({ page }) => {
    let failing = true;
    await page.route(
      (url) => url.pathname.endsWith('/rest/v1/classes'),
      (route) => (failing ? route.abort() : route.continue()),
    );

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();

    const err = page.locator('#schedule-load-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('We couldn’t load the timetable');
    await expect(page.locator('#grid')).not.toContainText('No classes available');
    await expect(page.locator('#grid .card')).toHaveCount(0);

    // Connection back: Try again draws the timetable.
    failing = false;
    await page.locator('#schedule-retry-btn').click();
    await expect(page.locator('#grid .card').first()).toBeVisible({ timeout: 10000 });
    await expect(err).toHaveCount(0);
  });

  test('Try again while still offline keeps the error and the button', async ({ page }) => {
    await page.route(
      (url) => url.pathname.endsWith('/rest/v1/blocks'),
      (route) => route.abort(),
    );

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await expect(page.locator('#schedule-load-error')).toBeVisible();

    await page.locator('#schedule-retry-btn').click();
    await expect(page.locator('#schedule-load-error')).toBeVisible();
    await expect(page.locator('#schedule-retry-btn')).toBeEnabled();
    await expect(page.locator('#schedule-retry-btn')).toHaveText('Try again');
  });
});
