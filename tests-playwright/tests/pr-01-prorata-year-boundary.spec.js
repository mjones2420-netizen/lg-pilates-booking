// PR-01 — Prorata pricing is correct across the Dec→Jan year boundary
//
// What this proves (regression for #54):
//   calcProrata() now derives each session date from the block's own
//   start_date + i*7 days (the reliable ISO source of truth) instead of
//   guessing a year from the display strings in blk.dates[]. The old code
//   read a past "29 Dec" session as *next* December (still to come), so a
//   client joining in January was wrongly charged the FULL block price.
//
// Approach:
//   The bug only surfaces when "today" falls in January, mid-block. We can't
//   wait for January, so Playwright's clock API freezes the browser clock and
//   we call the real, page-defined window.calcProrata() directly with a block
//   that spans 15 Dec 2025 → 19 Jan 2026 (6 weekly sessions). calcProrata reads
//   `new Date()`, which the frozen clock controls — so this exercises the exact
//   deployed function, not a copy. No DB writes.
//
//   Sessions: 15 Dec, 22 Dec, 29 Dec, 5 Jan, 12 Jan, 19 Jan. Price £12/session.
//   With today frozen to 12 Jan 2026, only 12 Jan + 19 Jan remain → 2 sessions,
//   £24. The old year-guessing code returned 5 "remaining" (£60) — the bug.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');

const APP_URL = process.env.TEST_APP_URL;

// A block spanning the Dec→Jan year boundary. dates[] is display-only now;
// calcProrata computes purely from start_date + weeks.
const YEAR_BOUNDARY_BLOCK = {
  price: 12,
  weeks: 6,
  start_date: '2025-12-15',
  dates: ['15 Dec', '22 Dec', '29 Dec', '5 Jan', '12 Jan', '19 Jan'],
};

async function calcProrataAt(page, isoDateTime, block) {
  await page.clock.setFixedTime(new Date(isoDateTime));
  return page.evaluate((b) => window.calcProrata(b), block);
}

test.describe('PR-01 — Prorata across the Dec→Jan year boundary (#54)', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PR spec requires the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    // Confirm we are on the TEST backend before doing anything.
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await page.waitForFunction(() => typeof window.calcProrata === 'function');
  });

  test('mid-block in January → prorated for the 2 remaining sessions, not full price', async ({ page }) => {
    const pr = await calcProrataAt(page, '2026-01-12T09:00:00', YEAR_BOUNDARY_BLOCK);
    expect(pr.totalSessions).toBe(6);
    expect(pr.sessionsRemaining).toBe(2); // 12 Jan + 19 Jan
    expect(pr.isProrata).toBe(true);
    expect(pr.totalPrice).toBe(24); // 2 × £12 — NOT the buggy £60
    expect(pr.fullPrice).toBe(72);
  });

  test('one session left in January → charge for exactly that session', async ({ page }) => {
    const pr = await calcProrataAt(page, '2026-01-13T09:00:00', YEAR_BOUNDARY_BLOCK);
    expect(pr.sessionsRemaining).toBe(1); // only 19 Jan remains
    expect(pr.isProrata).toBe(true);
    expect(pr.totalPrice).toBe(12);
  });

  test('before the block starts → full price, not prorated', async ({ page }) => {
    const pr = await calcProrataAt(page, '2025-12-01T09:00:00', YEAR_BOUNDARY_BLOCK);
    expect(pr.sessionsRemaining).toBe(6);
    expect(pr.isProrata).toBe(false);
    expect(pr.totalPrice).toBe(72);
  });

  test('after the block ends → zero remaining, full price fallback (never negative)', async ({ page }) => {
    const pr = await calcProrataAt(page, '2026-02-01T09:00:00', YEAR_BOUNDARY_BLOCK);
    expect(pr.sessionsRemaining).toBe(0);
    expect(pr.isProrata).toBe(false); // remaining==0 → not prorata
    expect(pr.totalPrice).toBe(72);
  });
});
