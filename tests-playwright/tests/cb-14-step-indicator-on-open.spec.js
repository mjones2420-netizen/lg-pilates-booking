// CB-14 — Step indicator: shows correct state on modal open (new client / 4-step layout)
//
// Verifies that when the booking modal is first opened, the step indicator is
// in its initial state: 4 pips visible, pip 1 active, pips 2-4 dim, all
// connectors un-done, and labels reading "Your details / Medical /
// Emergency contact / Payment".
//
// This test does NOT enter any data — it only inspects the indicator state
// immediately after the modal opens.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal } = require('./helpers/booking-flow');

test.describe('CB-14 — Step indicator on modal open', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    // Hard guard: confirm we are pointed at the test environment.
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('opens with 4-pip layout, pip 1 active, pips 2-4 dim', async ({ page }) => {
    // Use the Monday class — the active "mon-current" block makes it bookable.
    await openBookingModal(page, 'Monday', 'current');

    // -- Wrappers: all 4 pips and all 3 connectors visible --
    await expect(page.locator('#pip-wrap-2')).toBeVisible();
    await expect(page.locator('#pip-wrap-3')).toBeVisible();
    await expect(page.locator('#pip-wrap-4')).toBeVisible();
    await expect(page.locator('#conn-1')).toBeVisible();
    await expect(page.locator('#conn-2')).toBeVisible();
    await expect(page.locator('#conn-3')).toBeVisible();

    // -- Pip 1 active, circle shows "1" (not a tick yet) --
    await expect(page.locator('#pip-1')).toHaveClass(/active/);
    await expect(page.locator('#pip-1')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-1')).toHaveText('1');
    await expect(page.locator('#pip-lbl-1')).toHaveClass(/active/);
    await expect(page.locator('#pip-lbl-1')).toHaveText('Your details');

    // -- Pips 2, 3, 4 are dim (no .active, no .done) --
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#pip-${n}`)).not.toHaveClass(/active/);
      await expect(page.locator(`#pip-${n}`)).not.toHaveClass(/done/);
      await expect(page.locator(`#pip-${n}`)).toHaveText(String(n));
      await expect(page.locator(`#pip-lbl-${n}`)).not.toHaveClass(/active/);
      await expect(page.locator(`#pip-lbl-${n}`)).not.toHaveClass(/done/);
    }

    // -- Labels read correctly --
    await expect(page.locator('#pip-lbl-2')).toHaveText('Medical');
    await expect(page.locator('#pip-lbl-3')).toHaveText('Emergency contact');
    await expect(page.locator('#pip-lbl-4')).toHaveText('Payment');

    // -- Connectors: none .done at this stage --
    await expect(page.locator('#conn-1')).not.toHaveClass(/done/);
    await expect(page.locator('#conn-2')).not.toHaveClass(/done/);
    await expect(page.locator('#conn-3')).not.toHaveClass(/done/);
  });

});
