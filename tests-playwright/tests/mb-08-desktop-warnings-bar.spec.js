// tests/mb-08-desktop-warnings-bar.spec.js
//
// MB (Mobile Dashboard) — MB-08: the warnings bar on a laptop (#117).
//
// Before #117 the desktop warnings area never scrolled or shrank, so a long
// list squeezed All Bookings into a strip at the bottom. It now uses the same
// collapsed bar as phones.
//
// Scenario (1280x720, against whatever warnings the fixture produces — the
// seeded data always has at least one):
//   - arrives closed, with a count, a "Click to see them" hint and a one-line
//     breakdown, and the page underneath keeps real height
//   - opens on click with no 40% cap (it may fill the main area, never more)
//   - stays open across dashboard page switches, closes on a second click
//   - Enter on the bar toggles it too
//   - a reload starts closed again (nothing is remembered)
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;

test.describe('MB-08 — Desktop warnings bar', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — MB specs require the app to be served.');
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner must be visible'
    ).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
    await expect(page.locator('#btbody tr').first()).not.toContainText('Loading...', { timeout: 15000 });
    await expect(page.locator('#dbwarn-summary')).toBeVisible({ timeout: 15000 });
  });

  test('MB-08 — closed on arrival, opens without a cap, stays open across pages, closes again', async ({ page }) => {
    const summary = page.locator('#dbwarn-summary');
    const body = page.locator('#dbwarn-body');

    // Closed, with the count, a mouse-worded hint and the breakdown line.
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await expect(body).toBeHidden();
    await expect(summary).toContainText(/\d+ things? needs? attention/);
    await expect(page.locator('#dbwarn-hint')).toHaveText('Click to see them');
    await expect(summary.locator('.db-warn-break')).not.toBeEmpty();

    // The bookings pane keeps most of the screen while the bar is closed.
    const contentBox = await page.locator('#dbpage-bookings .db-content').boundingBox();
    expect(contentBox.height, 'All Bookings must not be squeezed by the warnings').toBeGreaterThan(300);

    // Open: the whole list, not capped at 40% — it is only ever clipped
    // (and then scrollable) when it is taller than the main area itself.
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    await expect(body).toBeVisible();
    await expect(page.locator('#dbwarn-hint')).toHaveText('Click to close');
    const sizes = await page.evaluate(() => {
      const w = document.querySelector('.db-warnings');
      const main = document.querySelector('.db-main');
      return { client: w.clientHeight, scroll: w.scrollHeight, main: main.clientHeight };
    });
    const fitsWhole = sizes.scroll <= sizes.client + 1;
    const fillsMain = sizes.client >= sizes.main - 1;
    expect(fitsWhole || fillsMain, `warnings capped below their content: ${JSON.stringify(sizes)}`).toBe(true);

    // Stays open while Louise moves around the dashboard.
    await page.evaluate(() => switchDashPage('clients'));
    await expect(body).toBeVisible();
    await page.evaluate(() => switchDashPage('bookings'));
    await expect(body).toBeVisible();

    // A second click closes it; Enter works as well as a click.
    await summary.click();
    await expect(body).toBeHidden();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(body).toBeVisible();

    // Nothing is remembered: a reload arrives closed.
    await page.reload();
    await loginAsAdmin(page);
    await expect(page.locator('#dbwarn-summary')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#dbwarn-summary')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#dbwarn-body')).toBeHidden();
  });
});
