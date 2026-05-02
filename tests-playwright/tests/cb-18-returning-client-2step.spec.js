// CB-18 — Step indicator: Returning client shows 2-step layout
//
// A customer with an existing email opens the booking modal, completes
// Step 1, and the system detects them as returning. Verifies:
//   - Pip 1 ticks (.done)
//   - Pip 2 becomes active and its label changes to "Payment"
//   - Pip wrappers 3 and 4 are hidden (display:none)
//   - Connectors 2 and 3 are hidden
//   - The user lands on the Payment step
//
// Uses returning-two@test.example because they have a confirmed booking on
// fri-recent-past, which seeds them as a returning customer in the test DB.
// We deliberately use Wednesday to avoid the duplicate-booking detection
// that returning-one would trigger on Monday.
//
// Note on test data: this spec books an emerging customer onto the Wed
// upcoming block if it gets all the way through to a successful Reserve.
// But CB-18 stops at Step 3 visible — it does NOT click Reserve, so no
// booking is created.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1 } = require('./helpers/booking-flow');

test.describe('CB-18 — Returning client 2-step layout', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('pip 1 ticks, pip 2 (Payment) active, pips 3 and 4 hidden', async ({ page }) => {
    // returning-two has a confirmed booking on Friday recent-past — seeded
    // as a returning customer with no active Wednesday booking.
    await openBookingModal(page, 'Wednesday', 'current');

    await fillStep1(page, {
      firstName: 'Returning',
      lastName:  'Two',
      email:     'returning-two@test.example',
      phone:     '07700900222'
    });

    // Returning client flow: skips Medical/Emergency, lands on Step 3 (Payment)
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 8000 });

    // -- Pip 1: done, tick --
    await expect(page.locator('#pip-1')).toHaveClass(/done/);
    await expect(page.locator('#pip-1')).toHaveText('\u2713');
    await expect(page.locator('#pip-lbl-1')).toHaveClass(/done/);
    await expect(page.locator('#pip-lbl-1')).toHaveText('Your details');

    // -- Pip 2: active, label now reads "Payment" --
    await expect(page.locator('#pip-2')).toHaveClass(/active/);
    await expect(page.locator('#pip-2')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-2')).toHaveText('2');
    await expect(page.locator('#pip-lbl-2')).toHaveClass(/active/);
    await expect(page.locator('#pip-lbl-2')).toHaveText('Payment');

    // -- Pip wrappers 3 and 4 hidden, plus connectors 2 and 3 --
    await expect(page.locator('#pip-wrap-3')).toBeHidden();
    await expect(page.locator('#pip-wrap-4')).toBeHidden();
    await expect(page.locator('#conn-2')).toBeHidden();
    await expect(page.locator('#conn-3')).toBeHidden();

    // -- Connector 1 still visible and now .done --
    await expect(page.locator('#conn-1')).toBeVisible();
    await expect(page.locator('#conn-1')).toHaveClass(/done/);
  });

});
