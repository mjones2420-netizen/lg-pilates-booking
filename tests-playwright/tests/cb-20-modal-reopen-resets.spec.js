// CB-20 — Step indicator resets cleanly when modal reopened
//
// Open booking modal, advance partway through, close it, then reopen and
// verify the step indicator is back to its initial state. Verifies:
//   - Pip 1 active, shows "1" (not a tick)
//   - All other pips dim, no .active or .done
//   - Pip 2 label is "Medical" (not the "Payment" returning-client label)
//   - All 4 pips and 3 connectors visible (4-step layout)
//   - No connectors are .done
//
// This guards against state leaking between modal open/close cycles —
// e.g. a returning customer's "Payment" label sticking around after close,
// or .done classes persisting on pips.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1, uniqueTestEmail } = require('./helpers/booking-flow');

test.describe('CB-20 — Modal close & reopen resets state', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('reopened modal returns to step 1, all ticks cleared, 4-step layout', async ({ page }) => {
    // -- Open modal and advance to step 2 (medical) so pip 1 is .done --
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'Test',
      lastName:  'Client',
      email:     uniqueTestEmail(20),
      phone:     '07700900123'
    });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#pip-1')).toHaveClass(/done/);
    await expect(page.locator('#pip-2')).toHaveClass(/active/);

    // -- Close the modal via the "x" button --
    await page.locator('button.mclose[onclick="closeModal()"]').click();
    await expect(page.locator('#overlay.on')).toBeHidden();

    // -- Reopen on the same class --
    await openBookingModal(page, 'Monday', 'current');

    // -- Pip 1: active, "1" not a tick --
    await expect(page.locator('#pip-1')).toHaveClass(/active/);
    await expect(page.locator('#pip-1')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-1')).toHaveText('1');
    await expect(page.locator('#pip-lbl-1')).toHaveClass(/active/);
    await expect(page.locator('#pip-lbl-1')).toHaveText('Your details');

    // -- Pips 2, 3, 4 dim and showing their numbers --
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#pip-${n}`)).not.toHaveClass(/active/);
      await expect(page.locator(`#pip-${n}`)).not.toHaveClass(/done/);
      await expect(page.locator(`#pip-${n}`)).toHaveText(String(n));
    }

    // -- Pip 2 label is "Medical" (not "Payment" — full reset to new-client default) --
    await expect(page.locator('#pip-lbl-2')).toHaveText('Medical');
    await expect(page.locator('#pip-lbl-3')).toHaveText('Emergency contact');
    await expect(page.locator('#pip-lbl-4')).toHaveText('Payment');

    // -- 4-step layout: all pip wrappers and connectors visible --
    await expect(page.locator('#pip-wrap-2')).toBeVisible();
    await expect(page.locator('#pip-wrap-3')).toBeVisible();
    await expect(page.locator('#pip-wrap-4')).toBeVisible();
    await expect(page.locator('#conn-1')).toBeVisible();
    await expect(page.locator('#conn-2')).toBeVisible();
    await expect(page.locator('#conn-3')).toBeVisible();

    // -- No connectors marked .done --
    await expect(page.locator('#conn-1')).not.toHaveClass(/done/);
    await expect(page.locator('#conn-2')).not.toHaveClass(/done/);
    await expect(page.locator('#conn-3')).not.toHaveClass(/done/);
  });

});
