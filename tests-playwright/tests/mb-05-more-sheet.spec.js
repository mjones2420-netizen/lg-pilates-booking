// tests/mb-05-more-sheet.spec.js
//
// MB (Mobile Dashboard) — MB-05: every page is reachable on a phone.
//
// Scenario (issue #103, "also found"):
//   Before this change the bottom nav had 5 slots and "More" jumped straight
//   to Settings, so By class, Booking history, Cancellations, Catch-up swaps
//   and Backup & export could not be opened on a phone at all.
//
//   Given: the dashboard on a phone
//   When:  "More" is tapped
//   Then:  a sheet lists every dashboard page; choosing one navigates there and
//          closes the sheet; the scrim and Escape also close it.
//
// Mechanism:
//   toggleDashMore() / dashMoreGo() drive #db-more-sheet and #db-more-scrim.
//   switchDashPage() lights "More" in the bottom nav whenever the active page
//   is not one of the four direct slots (bookings / byclass / clients / classes).
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

const ALL_PAGES = [
  'bookings', 'byclass', 'history', 'clients', 'cancellations',
  'catchup', 'waitlist', 'classes', 'reports', 'settings', 'backup'
];

test.describe('MB-05 — More sheet reaches every dashboard page', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — MB specs require the app to be served.');
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner must be visible'
    ).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
    await expect(page.locator('#btbody tr').first()).not.toContainText('Loading...', { timeout: 15000 });
  });

  test('MB-05a — More lists every dashboard page and navigating closes the sheet', async ({ page }) => {
    const sheet = page.locator('#db-more-sheet');
    const scrim = page.locator('#db-more-scrim');

    await expect(sheet).toBeHidden();
    await page.locator('#dbbn-more').click();
    await expect(sheet).toBeVisible();
    await expect(scrim).toBeVisible();

    for (const name of ALL_PAGES) {
      await expect(
        page.locator(`#dbmore-${name}`),
        `More sheet must list the "${name}" page`
      ).toBeVisible();
    }
    await expect(sheet.getByText('Sign out')).toBeVisible();

    // Cancellations was one of the five pages previously unreachable on a phone.
    await page.locator('#dbmore-cancellations').click();
    await expect(page.locator('#dbpage-cancellations.on')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(scrim).toBeHidden();

    // Cancellations is not a direct nav slot, so "More" carries the highlight.
    await expect(page.locator('#dbbn-more')).toHaveClass(/\bon\b/);
    await expect(page.locator('#dbmore-cancellations')).toHaveClass(/\bon\b/);
  });

  test('MB-05b — the four direct slots switch pages and take the highlight', async ({ page }) => {
    for (const name of ['byclass', 'clients', 'classes', 'bookings']) {
      await page.locator(`#dbbn-${name}`).click();
      await expect(page.locator(`#dbpage-${name}.on`)).toBeVisible();
      await expect(page.locator(`#dbbn-${name}`)).toHaveClass(/\bon\b/);
      await expect(page.locator('#dbbn-more')).not.toHaveClass(/\bon\b/);
    }
  });

  test('MB-05c — scrim tap and Escape close the sheet', async ({ page }) => {
    const sheet = page.locator('#db-more-sheet');

    await page.locator('#dbbn-more').click();
    await expect(sheet).toBeVisible();
    // Click the scrim in the gap between the TEST MODE banner (which sits on
    // top at the viewport's origin) and the sheet's own top edge, so the click
    // genuinely lands on the scrim rather than being intercepted.
    const sheetBox = await sheet.boundingBox();
    const bannerBox = await page.locator('#test-mode-banner').boundingBox();
    const gapY = Math.round((bannerBox.y + bannerBox.height + sheetBox.y) / 2);
    expect(gapY, 'need a clickable strip of scrim above the sheet')
      .toBeLessThan(sheetBox.y);
    await page.mouse.click(10, gapY);
    await expect(sheet).toBeHidden();

    await page.locator('#dbbn-more').click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});
