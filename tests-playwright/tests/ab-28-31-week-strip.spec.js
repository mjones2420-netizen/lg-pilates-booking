// tests/ab-28-31-week-strip.spec.js
//
// AB (Admin Bookings) — the "This week" strip at the top of All bookings (#89).
// Every class on its weekday with how full it is: the block running this week,
// or the class's next block when none is running. Days with no classes get no
// column. On phones it is folded to a one-line summary until tapped.
//
// Counts are checked against the page's own `blocks` (same load the strip drew
// from), not the DB — other specs book onto shared blocks in parallel.
//
// Read-only spec — uses seeded fixture data, no DB writes.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

async function openDashboard(page) {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
  await loginAsAdmin(page);
  await page.evaluate(() => dashLoadPromise);
  await expect(page.locator('#week-strip .ws-card').first()).toBeAttached({ timeout: 15000 });
}

// The day column (desktop) / day row (phone) for a weekday, e.g. 'Tue'.
const dayCol = (page, short) =>
  page.locator('#week-strip .ws-day').filter({ has: page.locator('.ws-day-name', { hasText: new RegExp('^' + short + '$', 'i') }) });

test.describe('AB-28 to AB-31 — Week strip on All bookings', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  test('AB-28 — each class sits on its weekday with the booked count of its block; empty days have no column', async ({ page }) => {
    await openDashboard(page);
    const strip = page.locator('#week-strip');
    await expect(strip.locator('.week-strip-title')).toHaveText('This week');

    // What the strip should show, worked out from the page's own data.
    const expected = await page.evaluate(() => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const monIso = weekStripIso(mon), sunIso = weekStripIso(sun);
      return classes.map(c => {
        const live = blocks.filter(b => b.class_id === c.id && !isBlockPast(b))
          .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
        const running = live.find(b => b.start_date <= sunIso && b.end_date >= monIso);
        const blk = running || live.find(b => b.visible !== false);
        return { id: c.id, day: c.day.slice(0, 3), name: c.name, count: blk ? blk.booked + '/' + blk.cap + ' booked' : null, running: !!running };
      });
    });
    expect(expected.length).toBeGreaterThan(0);

    for (const e of expected) {
      const card = dayCol(page, e.day).locator(`.ws-card[data-class-id="${e.id}"]`);
      await expect(card, `${e.name} on ${e.day}`).toHaveCount(1);
      await expect(card.locator('.ws-name')).toHaveText(e.name);
      if (e.count) await expect(card.locator('.ws-fill')).toContainText(e.count);
      if (e.count && !e.running) await expect(card.locator('.ws-note')).toContainText('Next block starts');
    }

    // One column per day that has a class — no empty days. (Other specs add
    // temporary weekend classes in parallel, so weekends aren't asserted absent.)
    await expect(strip.locator('.ws-day')).toHaveCount(new Set(expected.map(e => e.day)).size);
  });

  test('AB-29 — a full class is marked FULL', async ({ page }) => {
    await openDashboard(page);
    // Class 5 "Practice – Full Class" (Tuesday): its current block is seeded full, 2/2.
    const card = dayCol(page, 'Tue').locator('.ws-card').filter({ hasText: 'Practice' });
    await expect(card).toHaveClass(/\bfull\b/);
    await expect(card.locator('.ws-fill')).toContainText('2/2 booked');
    await expect(card.locator('.ws-tag')).toHaveText('FULL');
  });

  test('AB-30 — clicking a class opens it on the By class page', async ({ page }) => {
    await openDashboard(page);
    const card = dayCol(page, 'Tue').locator('.ws-card').filter({ hasText: 'Practice' });
    const classId = await card.getAttribute('data-class-id');
    await card.click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();
    await expect(page.locator('#dbpage-byclass')).toBeVisible();
    await expect(page.locator('#cg-' + classId)).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: PHONE });

    test('AB-31 — starts folded with a summary line and opens when tapped', async ({ page }) => {
      await openDashboard(page);
      const strip = page.locator('#week-strip');
      const total = await strip.locator('.ws-card').count();

      await expect(strip.locator('.ws-summary')).toBeVisible();
      await expect(strip.locator('.ws-summary')).toContainText(total + ' class');
      await expect(strip.locator('.ws-summary')).toContainText('full'); // practice class is full
      await expect(strip.locator('.week-strip-range')).toBeHidden();
      await expect(strip.locator('.week-strip-days')).toBeHidden();

      await expect(strip.locator('.week-strip-head')).toHaveAttribute('aria-expanded', 'false');
      await strip.locator('.week-strip-head').click();
      await expect(strip.locator('.week-strip-days')).toBeVisible();
      await expect(strip.locator('.week-strip-head')).toHaveAttribute('aria-expanded', 'true');
      await expect(dayCol(page, 'Tue').locator('.ws-card').filter({ hasText: 'Practice' })).toContainText('2/2 booked');

      await strip.locator('.week-strip-head').click();
      await expect(strip.locator('.week-strip-days')).toBeHidden();
    });
  });
});
