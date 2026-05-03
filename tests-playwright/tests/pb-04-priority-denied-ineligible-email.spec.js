// tests/pb-04-priority-denied-ineligible-email.spec.js
//
// PB (Priority Booking) — PB-04: Priority denied — ineligible client.
//
// Excel scenario PB-04: "Priority denied — ineligible client"
//   Given: A next block in the priority window (8-14 days out)
//   When:  A visitor enters an email that has NO booking on the previous block
//          and no manual priority grant
//   Then:  - Access denied message shown ("You don't have priority booking...")
//          - Message contains the date standard booking opens
//          - No booking modal opens
//          - The visitor stays on the email gate (modal is not opened)
//
// Fixture role used: mon-upcoming
//   The priority gate is rendered for a class's nextBlk panel only — i.e.
//   the class needs both a current block AND a future block. Monday is the
//   only fixture class with both (mon-current active + mon-upcoming +8d).
//   For an ineligible email we use a fresh timestamped address that does
//   not exist in the customers table — the check_priority_access RPC short-
//   circuits to FALSE when v_customer_id IS NULL, exercising the cleanest
//   denial path.
//
// Session 16 follow-up: original draft pointed at the Wednesday card under
// the wrong assumption that wed-upcoming would render a gate. Wednesday has
// no current block in the fixture so wed-upcoming is rendered as the
// "current" block via getActiveBlock fallback — there is no nextBlk panel,
// and therefore no gate. Switched to Monday.
//
// Safe to re-run without reseeding (no DB writes, no fixture mutation).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;

test.describe('PB-04 — Priority denied for ineligible email', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('ineligible email entered into the priority gate is denied with the standard-open message', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');
    const ineligibleEmail = `pb04-${Date.now()}@test.example`;

    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    await card.locator('.next-blk-toggle').click();

    const nextPanel = card.locator('.next-blk-body');
    await expect(nextPanel).toBeVisible();

    // Enter ineligible email and click Check My Priority.
    await nextPanel.locator(`#pemail-${monUpcoming.id}`).fill(ineligibleEmail);
    await nextPanel.locator('button.book-btn', { hasText: 'Check My Priority' }).click();

    // Deny message renders inside #pmsg-{blockId}. The message includes the
    // standard booking open date, generated server-side by denyPriorityAccess.
    const denyMsg = nextPanel.locator(`#pmsg-${monUpcoming.id}`);
    await expect(denyMsg).toBeVisible({ timeout: 5000 });
    await expect(denyMsg).toContainText(/don't have priority booking/i);
    await expect(denyMsg).toContainText(/Standard booking opens/i);

    // Negative check — no booking modal opens, gate stays in place.
    await expect(page.locator('#overlay.on')).not.toBeVisible();
    await expect(nextPanel.locator(`#pcheck-${monUpcoming.id}`)).toBeVisible();
  });
});
