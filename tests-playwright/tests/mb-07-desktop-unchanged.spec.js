// tests/mb-07-desktop-unchanged.spec.js
//
// MB (Mobile Dashboard) — MB-07: the desktop dashboard is unchanged.
//
// The mobile work moved the dashboard breakpoint from 700px to 940px, added
// mobile-only markup to every row builder, and restyled the tables below that
// width. This spec is the guard that none of it leaks upwards.
//
// Scenario:
//   Given: the dashboard at 1280x720
//   Then:  the sidebar shows and the bottom nav does not; the More sheet and
//          its trigger are hidden; the warnings banner renders in full with no
//          summary header; tables render as real tables with a visible thead
//          and all cells shown; and the .m-sub sub-lines / status dots / block
//          eyebrow labels are not displayed.
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;

test.describe('MB-07 — Desktop dashboard unchanged', () => {
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
  });

  test('MB-07a — desktop chrome: sidebar in, mobile nav and More sheet out', async ({ page }) => {
    await expect(page.locator('.db-sidebar')).toBeVisible();
    await expect(page.locator('.db-bottom-nav')).toBeHidden();
    await expect(page.locator('#dbbn-more')).toBeHidden();
    await expect(page.locator('#db-more-sheet')).toBeHidden();
    await expect(page.locator('#db-more-scrim')).toBeHidden();

    // Warnings render in full — no collapsed summary header on desktop.
    await expect(page.locator('#dbwarn-summary')).toBeHidden();
    await expect(page.locator('#dbwarn-body')).toBeVisible();
    await expect(page.locator('#dbwarn-body .block-warning').first()).toBeVisible();
  });

  test('MB-07b — tables render as real tables, mobile-only markup hidden', async ({ page }) => {
    const row = page.locator('#btbody tr[data-search]').first();
    await expect(row).toBeVisible();

    // A real table: thead on screen, every cell shown, no card layout.
    const thead = page.locator('#dbpage-bookings thead').first();
    await expect(thead).toBeVisible();
    const theadBox = await thead.boundingBox();
    expect(theadBox, 'thead should have a box').not.toBeNull();
    expect(theadBox.x, 'thead must not be pushed off-screen on desktop').toBeGreaterThanOrEqual(0);

    expect(await row.evaluate(r => getComputedStyle(r).display)).toBe('table-row');
    await expect(row.locator('td[data-label="Block"]')).toBeVisible();
    await expect(row.locator('td[data-label="Paid"]')).toBeVisible();
    await expect(row.locator('td.m-badge')).toBeVisible();

    // Mobile-only additions stay hidden.
    await expect(row.locator('.m-sub')).toBeHidden();
    await expect(row).not.toHaveClass(/\bm-open\b/);

    // Clicking a row does nothing on desktop — the toggle bails above 940px.
    await row.locator('td').first().click();
    await expect(row).not.toHaveClass(/\bm-open\b/);
  });

  test('MB-07c — Classes dots and By Class eyebrow labels are hidden on desktop', async ({ page }) => {
    await page.locator('#dbnav-classes').click();
    await expect(page.locator('#dbpage-classes.on')).toBeVisible();
    const dot = page.locator('#ctbody .m-dot').first();
    if (await dot.count()) await expect(dot).toBeHidden();

    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbpage-byclass.on')).toBeVisible();
    await page.locator('#classes-accordion .class-group-header').first().click();

    const eyebrow = page.locator('#classes-accordion .blk-eyebrow').first();
    await expect(eyebrow).toBeHidden();
    // The original inline Active/Upcoming pill is what desktop still shows.
    await expect(page.locator('#classes-accordion .blk-badge-inline').first()).toBeVisible();
  });
});
