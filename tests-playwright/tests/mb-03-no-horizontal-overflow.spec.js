// tests/mb-03-no-horizontal-overflow.spec.js
//
// MB (Mobile Dashboard) — MB-03: nothing is chopped off sideways.
//
// Scenario (issue #103, symptom 3):
//   Given: the admin dashboard on a 390px-wide phone
//   When:  each of the ten dashboard pages is opened
//   Then:  the document does not scroll horizontally, and no table row is
//          wider than the viewport.
//
// Mechanism:
//   The mobile query restyles the existing <table> markup into stacked flex
//   rows (display:block on table/tbody, thead moved off-screen), so the six
//   and seven column tables no longer force a desktop-width layout.
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

const PAGES = [
  'bookings', 'byclass', 'history', 'clients', 'cancellations',
  'catchup', 'classes', 'reports', 'settings', 'backup'
];

// Per page, a locator that only resolves once that page has drawn real content.
// Used instead of a fixed wait so an empty page can never pass the width check
// by having nothing in it.
const PAGE_READY = {
  bookings:      '#btbody tr td',
  byclass:       '#classes-accordion .class-group-header',
  history:       '#historytbody tr td',
  clients:       '#customers-tbody tr td',
  cancellations: '#cancellations-tbody tr td',
  catchup:       '#catchup-list',
  classes:       '#ctbody tr td',
  reports:       '#rpt-capacity-rows .db-cap-row',
  settings:      '#dbpage-settings .db-settings-card',
  backup:        '#dbpage-backup .db-export-row'
};

test.describe('MB-03 — No horizontal overflow on any dashboard page', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — MB specs require the app to be served.');
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner must be visible'
    ).toBeVisible({ timeout: 5000 });
  });

  test('MB-03 — every page fits the viewport width', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('#btbody tr').first()).not.toContainText('Loading...', { timeout: 15000 });

    for (const name of PAGES) {
      await page.evaluate(p => window.switchDashPage(p), name);
      await expect(page.locator(`#dbpage-${name}.on`)).toBeVisible();

      // Wait on real rendered content, not a fixed sleep. A slow worker plus a
      // timeout would leave the page empty — scrollWidth would trivially equal
      // innerWidth and the regression this spec exists to catch would pass
      // unnoticed. PAGE_READY names a locator that only appears once the page
      // has actually drawn something wide enough to overflow.
      await expect(
        page.locator(PAGE_READY[name]).first(),
        `page "${name}" never rendered content — the overflow check would pass vacuously`
      ).toBeVisible({ timeout: 20000 });

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));
      expect(
        metrics.scrollWidth,
        `page "${name}" scrolls horizontally (${metrics.scrollWidth} > ${metrics.innerWidth})`
      ).toBeLessThanOrEqual(metrics.innerWidth);

      // tbody only: the <thead> is parked off-screen at left:-9999px at its
      // natural table width, so it reports a wide box while contributing
      // nothing to the document's scrollWidth (asserted above).
      const widest = await page.evaluate(pageName => {
        const rows = document.querySelectorAll(`#dbpage-${pageName} .db-content tbody tr`);
        let max = 0;
        rows.forEach(r => { max = Math.max(max, r.getBoundingClientRect().width); });
        return max;
      }, name);
      expect(
        widest,
        `page "${name}" has a table row wider than the viewport`
      ).toBeLessThanOrEqual(metrics.innerWidth);
    }
  });
});
