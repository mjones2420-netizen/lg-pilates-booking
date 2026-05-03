// tests/pb-01-locked-window-not-open-yet.spec.js
//
// PB (Priority Booking) — PB-01: Next block locked — more than 14 days away.
//
// Excel scenario PB-01: "Next block locked — more than 14 days away"
//   Given: A class has a next block whose start date is more than 14 days from today
//   When:  A visitor loads the booking page
//   Then:  - A disabled "Not Open Yet" button is shown on the next-block panel
//          - The info panel displays three dated rows: Priority booking opens,
//            Standard booking opens, Block starts
//          - No Book button and no email gate appear
//
// Fixture role used: thu-locked
//   Migration 11 added a Thursday class (class_id=4) with two blocks:
//     - thu-current  (active, today is mid-block)
//     - thu-locked   (upcoming, +30 days from today — well into the locked window)
//   Thursday's card therefore has thu-current as its rendered "current" block
//   and thu-locked as its nextBlk panel — exactly the shape needed to render
//   the tooEarly branch in renderClassesView() (the locked-window UI).
//
// No customer interaction needed — pure UI render assertion.
// Safe to re-run without reseeding.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;

test.describe('PB-01 — Locked window: Not Open Yet panel + 3-row info', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Thursday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('locked-window class card shows the disabled Not Open Yet button and 3-row info panel', async ({ page }) => {
    // Sanity-check the fixture role — confirm thu-locked is genuinely >14 days out.
    const thuLocked = await getBlockByRole('thu-locked');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(thuLocked.start_date + 'T00:00:00');
    const daysUntil = Math.round((start - today) / (1000 * 60 * 60 * 24));
    expect(daysUntil, 'thu-locked must be >14 days out for the locked-window UI to render').toBeGreaterThan(14);

    // Locate the Thursday class card.
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Thursday' })
    }).first();
    await expect(card).toBeVisible();

    // Expand the next-block toggle so the locked-window panel renders.
    await card.locator('.next-blk-toggle').click();
    const nextPanel = card.locator('.next-blk-body');
    await expect(nextPanel).toBeVisible();

    // The disabled "Not Open Yet" button is shown.
    const lockedBtn = nextPanel.locator('button.book-btn', { hasText: 'Not Open Yet' });
    await expect(lockedBtn).toBeVisible();
    await expect(lockedBtn).toBeDisabled();

    // The info panel must contain all four labels.
    const info = nextPanel.locator('.priority-info');
    await expect(info).toBeVisible();
    await expect(info).toContainText(/Not open yet/i);
    await expect(info).toContainText(/Priority booking opens/i);
    await expect(info).toContainText(/Standard booking opens/i);
    await expect(info).toContainText(/Block starts/i);

    // Negative checks — no email gate and no enabled Book button on this panel.
    await expect(nextPanel.locator(`#pcheck-${thuLocked.id}`)).toHaveCount(0);
    await expect(nextPanel.locator('button.book-btn.next-blk')).toHaveCount(0);
  });
});
