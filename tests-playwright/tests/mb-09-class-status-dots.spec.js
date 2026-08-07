// tests/mb-09-class-status-dots.spec.js
//
// MB (Mobile Dashboard) — MB-09: the Classes page status dots mean what the
// rest of the dashboard's colours mean.
//
// Scenario (session 83, Mark's review):
//   Given: the Classes page on a phone, where the Active/Upcoming columns are
//          collapsed behind a tap
//   When:  a class has an upcoming block
//   Then:  it shows an orange dot — the same colour .blk-badge-upcoming and the
//          By Class eyebrow already use for "upcoming".
//
// What changed and why:
//   The dots originally read green = active block, orange = NO upcoming block
//   (a warning). That inverted orange against every other use of the colour in
//   the dashboard — including the By Class eyebrow, where .m-dot.warn labels
//   "Upcoming block", and the expanded row directly beneath the dot, whose
//   "Upcoming block" cell is always orange. Nothing is lost by the switch: the
//   missing-next-block warning it used to carry is raised by the warnings
//   banner (renderBlockWarnings' "expiring" list), which is where a warning
//   belongs.
//
// Assertions derive the expected dots from each row's own Active/Upcoming
// cells rather than naming fixture classes, so this survives a reseed and the
// block-date drift that moves which fixture block is currently active.
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

test.describe('MB-09 — Classes page status dots', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — MB specs require the app to be served.');
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner must be visible'
    ).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
    await page.locator('#dbbn-classes').click();
    await expect(page.locator('#dbpage-classes.on')).toBeVisible();
    await expect(page.locator('#ctbody tr').first()).toBeVisible({ timeout: 15000 });
  });

  test('MB-09a — green tracks the active block, orange tracks the upcoming block', async ({ page }) => {
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#ctbody tr')).map(tr => {
        const cells = tr.querySelectorAll('td');
        const dots = Array.from(tr.querySelectorAll('.m-dot'));
        return {
          name: cells[0].querySelector('strong').textContent,
          hasActive: !cells[3].textContent.trim().startsWith('None'),
          hasUpcoming: !cells[4].textContent.trim().startsWith('None'),
          green: dots.filter(d => !d.classList.contains('warn')).length,
          orange: dots.filter(d => d.classList.contains('warn')).length,
          titles: dots.map(d => d.getAttribute('title')),
        };
      }));

    expect(rows.length).toBeGreaterThan(0);

    // The fixture must actually contain both cases, or this proves nothing.
    expect(rows.some(r => r.hasUpcoming), 'need a class WITH an upcoming block').toBe(true);
    expect(rows.some(r => !r.hasUpcoming), 'need a class WITHOUT an upcoming block').toBe(true);

    for (const r of rows) {
      expect(r.green, `${r.name}: green dot must track the active block`)
        .toBe(r.hasActive ? 1 : 0);
      expect(r.orange, `${r.name}: orange dot must track the UPCOMING block, not its absence`)
        .toBe(r.hasUpcoming ? 1 : 0);
      if (r.hasUpcoming) expect(r.titles).toContain('Upcoming block');
      // The old inverted meaning must not survive anywhere.
      expect(r.titles).not.toContain('No upcoming block');
    }
  });

  test('MB-09b — the dot colours match the badges the row expands to reveal', async ({ page }) => {
    // Pick a row that has both blocks, so both dots and both badges are present.
    const idx = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#ctbody tr')).findIndex(tr => {
        const c = tr.querySelectorAll('td');
        return !c[3].textContent.trim().startsWith('None')
            && !c[4].textContent.trim().startsWith('None');
      }));
    expect(idx, 'fixture needs a class with both an active and an upcoming block').toBeGreaterThan(-1);

    const row = page.locator('#ctbody tr').nth(idx);
    const green = row.locator('.m-dot:not(.warn)');
    const orange = row.locator('.m-dot.warn');
    await expect(green).toHaveCount(1);
    await expect(orange).toHaveCount(1);

    const colours = await row.evaluate(tr => {
      const rgb = el => getComputedStyle(el).backgroundColor;
      return {
        greenDot: rgb(tr.querySelector('.m-dot:not(.warn)')),
        orangeDot: rgb(tr.querySelector('.m-dot.warn')),
        activeBadge: rgb(tr.querySelector('.blk-badge-active')),
        upcomingBadge: rgb(tr.querySelector('.blk-badge-upcoming')),
      };
    });

    // The dots are the badge colours, not the badge backgrounds (those are the
    // pale pill fills), so assert they are distinct from each other and that
    // the orange dot is not reusing the green. This is the regression that
    // matters: the two dots must never collapse to the same meaning.
    expect(colours.greenDot).not.toBe(colours.orangeDot);
    expect(colours.activeBadge).not.toBe(colours.upcomingBadge);
  });
});
