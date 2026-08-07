// tests/mb-08-safe-area-insets.spec.js
//
// MB (Mobile Dashboard) — MB-08: screen-edge elements reserve the iOS safe area.
//
// Scenario (session 83, Mark's phone screenshot):
//   Given: the dashboard is open on an iPhone in Safari
//   When:  Safari's floating URL bar overlays the bottom of the page
//   Then:  the bottom nav's labels still sit clear of it.
//
// Mechanism:
//   Safari's floating bar and the home indicator OVERLAY the page rather than
//   shrinking the viewport, so .db-layout's 100dvh sizing does not avoid them.
//   The only signal is env(safe-area-inset-*), which reports 0 unless the
//   viewport meta carries viewport-fit=cover. Each screen-edge element adds the
//   matching inset back as padding.
//
// Why this asserts on --safe-top / --safe-bottom rather than env() directly:
//   env() cannot be simulated in a desktop browser — Chromium always reports 0,
//   so a test that only ran the real path would assert nothing. The insets are
//   funnelled through two custom properties precisely so a test can force a
//   non-zero value and prove the layout absorbs it. The zero case is checked
//   too, because that is what every non-notch device (and the whole desktop
//   suite) actually gets, and a regression there would be silent.
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

// Representative iPhone values: 59px status bar / notch, 34px home indicator.
const FORCED_TOP = 59;
const FORCED_BOTTOM = 34;

test.describe('MB-08 — Safe-area insets on screen-edge elements', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — MB specs require the app to be served.');
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner must be visible'
    ).toBeVisible({ timeout: 5000 });
  });

  test('MB-08a — viewport-fit=cover is set, without which every inset reports 0', async ({ page }) => {
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toContain('viewport-fit=cover');
  });

  test('MB-08b — with no inset, padding is unchanged from the pre-inset values', async ({ page }) => {
    await loginAsAdmin(page);

    // Chromium reports env(safe-area-inset-*) as 0, so this is the real
    // computed result on every device without a notch. These are the exact
    // values the rules carried before insets were introduced — a change here
    // means the inset work has cost non-notch devices layout.
    const pads = await page.evaluate(() => {
      const g = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
      return {
        bottomNav: g('.db-bottom-nav', 'paddingBottom'),
        moreSheet: g('.db-more-sheet', 'paddingBottom'),
        nav: g('nav', 'paddingTop'),
        overlay: g('.overlay', 'paddingTop'),
      };
    });

    expect(pads).toEqual({
      bottomNav: '2px',
      moreSheet: '14px',
      nav: '14px',
      overlay: '10px',
    });
  });

  test('MB-08c — a forced inset grows the bottom nav and keeps its labels on screen', async ({ page }) => {
    await loginAsAdmin(page);

    const nav = page.locator('.db-bottom-nav');
    await expect(nav).toBeVisible();

    const before = await nav.evaluate(el => ({
      pad: parseFloat(getComputedStyle(el).paddingBottom),
      bottom: el.getBoundingClientRect().bottom,
    }));

    await page.addStyleTag({
      content: `:root { --safe-top:${FORCED_TOP}px; --safe-bottom:${FORCED_BOTTOM}px; }`,
    });

    const after = await page.evaluate(() => {
      const el = document.querySelector('.db-bottom-nav');
      const label = document.querySelector('#dbbn-more span');
      return {
        pad: parseFloat(getComputedStyle(el).paddingBottom),
        bottom: el.getBoundingClientRect().bottom,
        labelBottom: label.getBoundingClientRect().bottom,
        viewportH: window.innerHeight,
        moreSheetPad: parseFloat(getComputedStyle(document.querySelector('.db-more-sheet')).paddingBottom),
      };
    });

    // The nav absorbs the inset as extra padding beneath its labels.
    expect(after.pad).toBe(before.pad + FORCED_BOTTOM);
    expect(after.moreSheetPad).toBe(14 + FORCED_BOTTOM);

    // The nav itself must still end inside the viewport — the inset must come
    // out of the content pane above it, not push the nav off the bottom.
    expect(after.bottom).toBeLessThanOrEqual(after.viewportH + 1);

    // The point of the whole change: the label clears the strip Safari's
    // floating bar occupies, rather than sitting underneath it.
    expect(after.viewportH - after.labelBottom).toBeGreaterThanOrEqual(FORCED_BOTTOM);
  });

  test('MB-08d — the TEST MODE banner owns the top inset, so nav does not double it', async ({ page }) => {
    await loginAsAdmin(page);
    await page.addStyleTag({
      content: `:root { --safe-top:${FORCED_TOP}px; --safe-bottom:${FORCED_BOTTOM}px; }`,
    });

    // Banner present: it is fixed at top:0 and already covers the notch, and
    // body is padded past it — so nav must NOT claim the inset a second time.
    const withBanner = await page.evaluate(() =>
      getComputedStyle(document.querySelector('nav')).paddingTop);
    expect(withBanner).toBe('14px');

    // Overlays are NOT exempt — a modal still has to clear the notch, so the
    // zeroing must be scoped to nav rather than applied to the whole body.
    const overlayWithBanner = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.overlay')).paddingTop);
    expect(overlayWithBanner).toBe(`${10 + FORCED_TOP}px`);

    // Production has no banner, so there the nav must carry the inset itself.
    const withoutBanner = await page.evaluate(() => {
      document.body.classList.remove('has-test-banner');
      return getComputedStyle(document.querySelector('nav')).paddingTop;
    });
    expect(withoutBanner).toBe(`${14 + FORCED_TOP}px`);
  });
});
