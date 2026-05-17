// tests/ec-01-full-class-booking-prevented.spec.js
//
// EC (Edge Cases) — EC-01: Booking a full class is prevented.
//
// Excel scenario EC-01: "Booking a full class is prevented"
//   Given: A block where booked >= cap
//   When:  The user visits the public booking page
//   Then:  - The class card shows a "Full" badge
//          - The book button is disabled and shows "Current Block Full"
//
// Mechanism (front-end):
//   renderGrid() in index.html (line ~957) calculates `full = blk.booked >= blk.cap`
//   and renders:
//     - <span class="badge b-full">Full</span> next to the venue (line 981)
//     - <button class="book-btn" disabled>Current Block Full</button> (line 1019)
//
// Target block: fri-upcoming is the only block on the Friday class so it's
// always the one getActiveBlock() picks. Setting its booked count equal to
// its cap is a clean, isolated way to produce a "full" state without
// interfering with Monday or Wednesday cards used by other specs.
//
// We use the new setBlockBookedCount helper to bump booked = cap directly,
// then restore via resyncBlockBookedCount in afterEach (recalculates from
// real booking rows — fri-upcoming has 0 real bookings so it returns to 0).
//
// No customer/booking rows are created — pure UI state test.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { setBlockBookedCount, resyncBlockBookedCount } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-01 — Booking a full class is prevented', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  // Captured before the UPDATE so afterEach can always resync.
  let filledBlockId = null;

  test.beforeEach(async ({ page }) => {
    filledBlockId = null;

    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Always restore the booked count from real booking rows. The trigger
    // doesn't fire on direct UPDATEs, so the manual resync is essential.
    if (filledBlockId != null) {
      await resyncBlockBookedCount(filledBlockId);
    }
  });

  test('a block with booked = cap shows Full badge and disabled book button', async ({ page }) => {
    const friUpcoming = await getBlockByRole('fri-upcoming');
    expect(friUpcoming, 'fri-upcoming should resolve from fixture').toBeTruthy();

    // Set tracking BEFORE the UPDATE so afterEach restores even if the
    // UPDATE itself or any assertion fails.
    filledBlockId = friUpcoming.id;

    // Make the block full by directly setting booked = cap. No actual
    // booking rows are inserted — this is a UI-state test only.
    await setBlockBookedCount(friUpcoming.id, friUpcoming.cap);

    // Reload so the page picks up the new booked count.
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });

    // Locate the Friday card.
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Friday' })
    }).first();
    await expect(card, 'expected a Friday class card').toBeVisible({ timeout: 10000 });

    // The "Full" badge must be visible.
    const fullBadge = card.locator('.badge.b-full');
    await expect(fullBadge).toBeVisible();
    await expect(fullBadge).toHaveText('Full');

    // The primary book button must be disabled and labelled "Current Block Full".
    const primaryButton = card.locator('button.book-btn').first();
    await expect(primaryButton).toBeVisible();
    await expect(primaryButton).toBeDisabled();
    await expect(primaryButton).toHaveText('Current Block Full');
  });
});
