// tests/mb-04-expandable-rows.spec.js
//
// MB (Mobile Dashboard) — MB-04: the expandable row pattern.
//
// Scenario:
//   Given: the All Bookings table on a phone
//   When:  a row is tapped
//   Then:  its detail cells appear; tapping again hides them; tapping an
//          action button inside an open row does NOT collapse it; and the
//          search box still filters rows while they are collapsed.
//
// Mechanism:
//   One DOM at every width — the desktop <table> is restyled, never replaced.
//   A delegated click handler toggles tr.m-open, bails above 940px, and
//   ignores clicks that land on a button so the action handlers still fire.
//   That is why filterBookingsTable() (which queries tr[data-search]) and the
//   index-based viewBooking(i) handlers keep working unchanged.
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

test.describe('MB-04 — Expandable rows', () => {
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

  test('MB-04a — detail cells hide until the row is tapped', async ({ page }) => {
    const row = page.locator('#btbody tr[data-search]').first();
    await expect(row).toBeVisible();

    const nameCell = row.locator('td').first();
    const blockCell = row.locator('td[data-label="Block"]');
    const paidCell = row.locator('td[data-label="Paid"]');
    const statusCell = row.locator('td.m-badge');

    // Collapsed: name and status show, everything else is detail.
    await expect(nameCell).toBeVisible();
    await expect(statusCell).toBeVisible();
    await expect(row.locator('.m-sub')).toBeVisible();
    await expect(blockCell).toBeHidden();
    await expect(paidCell).toBeHidden();

    // Tap the row.
    await nameCell.click();
    await expect(row).toHaveClass(/\bm-open\b/);
    await expect(blockCell).toBeVisible();
    await expect(paidCell).toBeVisible();
    // The label comes from data-label via a ::before, so assert the attribute
    // rather than the rendered pseudo-element text.
    await expect(blockCell).toHaveAttribute('data-label', 'Block');

    // Tap again to close.
    await nameCell.click();
    await expect(row).not.toHaveClass(/\bm-open\b/);
    await expect(blockCell).toBeHidden();
  });

  test('MB-04b — tapping an action button does not collapse the row', async ({ page }) => {
    const row = page.locator('#btbody tr[data-search]').first();
    await row.locator('td').first().click();
    await expect(row).toHaveClass(/\bm-open\b/);

    // View is only reachable once the row is open (the actions cell is detail).
    const viewBtn = row.getByRole('button', { name: 'View' });
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();

    // The booking modal opened — so the button's own handler ran...
    await expect(page.locator('#view-overlay.on')).toBeVisible({ timeout: 10000 });
    // ...and the row underneath is still expanded, not toggled shut by the tap.
    await expect(row).toHaveClass(/\bm-open\b/);

    await page.evaluate(() => window.closeViewModal());
    await expect(page.locator('#view-overlay.on')).toBeHidden();
  });

  test('MB-04c — search still filters while rows are collapsed', async ({ page }) => {
    const rows = page.locator('#btbody tr[data-search]');
    const total = await rows.count();
    expect(total, 'fixture must provide at least one current booking').toBeGreaterThan(0);

    const firstName = (await rows.first().locator('td').first().innerText()).split('\n')[0].trim();

    await page.locator('#bookings-search').fill(firstName);
    await expect(page.locator('#bookings-result-count')).toContainText(/matched/);

    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('#btbody tr[data-search]')]
        .filter(r => r.style.display !== 'none').length
    );
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThanOrEqual(total);

    // A non-matching query hides everything.
    await page.locator('#bookings-search').fill('zzz-no-such-client-zzz');
    const none = await page.evaluate(() =>
      [...document.querySelectorAll('#btbody tr[data-search]')]
        .filter(r => r.style.display !== 'none').length
    );
    expect(none).toBe(0);

    // Clearing restores every row — display must fall back to the mobile
    // flex layout, not stay stuck at the desktop table-row value.
    await page.locator('#bookings-search').fill('');
    const restored = await page.evaluate(() =>
      [...document.querySelectorAll('#btbody tr[data-search]')]
        .filter(r => getComputedStyle(r).display === 'flex').length
    );
    expect(restored).toBe(total);
  });
});
