// tests/pb-02-priority-window-email-gate-shown.spec.js
//
// PB (Priority Booking) — PB-02: Priority window — email gate shown.
//
// Excel scenario PB-02: "Priority window — email gate shown"
//   Given: A class has a next block whose start date is 8-14 days from today
//   When:  A visitor loads the booking page and expands the next-block toggle
//   Then:  - An email input field is shown on the next-block panel
//          - A "Check My Priority" button is visible
//          - No direct "Book Next Block" button appears
//          - The "Priority booking is open" headline is shown
//
// Fixture role used: mon-upcoming
//   The priority gate is only rendered for a class's nextBlk panel — i.e. the
//   class needs both a current block AND an upcoming block. Monday is the
//   only class in the fixture that satisfies this (mon-current is active,
//   mon-upcoming is +8d in the priority window). Wednesday and Friday have
//   only one upcoming block each, so wed-upcoming and fri-upcoming get
//   rendered as the "current" block via the getActiveBlock fallback and
//   the gate UI is never shown.
//
// Session 16 follow-up: original draft pointed at the Wednesday card based
// on a wrong reading of the rendering logic (assumed each upcoming block
// rendered its own gate). Switched to Monday after PB-09 and PB-10 — which
// already use Monday's nextBlk panel — proved the gate is on Monday.
//
// No customer interaction — this is a pure UI render assertion.
// Safe to re-run without reseeding.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;

test.describe('PB-02 — Priority window: email gate shown, no direct Book button', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('priority-window class card shows the email gate and Check My Priority button', async ({ page }) => {
    // Sanity-check the fixture role — confirm mon-upcoming is in the priority window.
    const monUpcoming = await getBlockByRole('mon-upcoming');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(monUpcoming.start_date + 'T00:00:00');
    const daysUntil = Math.round((start - today) / (1000 * 60 * 60 * 24));
    expect(daysUntil, 'mon-upcoming must be 8-14 days out for the priority-window UI to render').toBeGreaterThan(7);
    expect(daysUntil).toBeLessThanOrEqual(14);

    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    await expect(card).toBeVisible();

    // Expand the next-block toggle.
    await card.locator('.next-blk-toggle').click();
    const nextPanel = card.locator('.next-blk-body');
    await expect(nextPanel).toBeVisible();

    // Headline "Priority booking is open" is shown.
    const info = nextPanel.locator('.priority-info');
    await expect(info).toBeVisible();
    await expect(info).toContainText(/Priority booking is open/i);
    await expect(info).toContainText(/Standard booking opens/i);
    await expect(info).toContainText(/Block starts/i);

    // The email gate (input + Check My Priority button) is rendered.
    const gate = nextPanel.locator(`#pcheck-${monUpcoming.id}`);
    await expect(gate).toBeVisible();

    const emailInput = nextPanel.locator(`#pemail-${monUpcoming.id}`);
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', /priority/i);

    const checkBtn = nextPanel.locator('button.book-btn', { hasText: 'Check My Priority' });
    await expect(checkBtn).toBeVisible();

    // Negative checks — no direct Book Next Block button, no Not Open Yet.
    await expect(nextPanel.locator('button.book-btn.next-blk')).toHaveCount(0);
    await expect(nextPanel.locator('button.book-btn', { hasText: 'Not Open Yet' })).toHaveCount(0);
  });
});
