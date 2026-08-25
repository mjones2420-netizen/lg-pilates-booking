// tests/ec-01-full-class-booking-prevented.spec.js
//
// EC (Edge Cases) — EC-01: Booking a full class is prevented.
//
// Excel scenario EC-01: "Booking a full class is prevented"
//   Given: A block where booked >= cap
//   When:  The user visits the public booking page
//   Then:  - The class card shows a "Full" badge
//          - The book button does NOT offer to book the block
//
// Mechanism (front-end):
//   renderGrid() in index.html calculates
//     spacesLeft = max(0, cap - booked - wait);  full = spacesLeft <= 0
//   and renders <span class="badge b-full">Full</span> next to the venue.
//
// UPDATED for the waiting list (#74). This spec used to assert a DISABLED
// button reading "Current Block Full" — that dead end is exactly what the
// waiting list replaces. A full block now offers "Join Waiting List", which is
// deliberately enabled. What EC-01 still guards is the thing it was always
// really about: a full block must never offer a way to BOOK it. WL-01 covers
// the join button's own appearance and wiring.
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

    // The primary button must not be a booking route into a full block.
    const primaryButton = card.locator('button.book-btn').first();
    await expect(primaryButton).toBeVisible();
    await expect(primaryButton).toHaveText('Join Waiting List');
    await expect(primaryButton).not.toHaveText('Book Current Block');

    // And there is genuinely no other way in from this card: nothing on it
    // opens the booking modal for the full block.
    await expect(card.locator('button.book-btn[onclick^="openModal"]')).toHaveCount(0);
  });
});
