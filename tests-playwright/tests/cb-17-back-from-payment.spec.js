// CB-17 — Step indicator: Back from Payment reactivates Step 3 (new client)
//
// New client reaches Step 4 (Payment) then clicks Back. Verifies:
//   - Pip 4 dims (no .active, no .done) — back to dim future state
//   - Pip 3 (Emergency contact) becomes .active again, shows "3"
//   - Pips 1 and 2 retain their ticks (.done)
//   - Connector 3 no longer .done; connectors 1 and 2 stay .done
//   - Modal scrolls to top
//
// Note: the Excel CB-17 was written for a 3-step flow ("Back from Step 3
// reactivates Step 2"). In the current 4-step flow this is "Back from
// Step 4 reactivates Step 3" — same behaviour, one step deeper.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  uniqueTestEmail
} = require('./helpers/booking-flow');

test.describe('CB-17 — Back from Payment reactivates Step 3', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('pip 4 dims, pip 3 reactivates, pips 1 and 2 keep ticks', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, {
      firstName: 'Test',
      lastName:  'Client',
      email:     uniqueTestEmail(17),
      phone:     '07700900123'
    });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 8000 });

    await fillStep2Medical(page, { age: 34, printName: 'Test Client' });
    await expect(page.locator('#step-2b')).toBeVisible();

    await fillStep2Emergency(page);
    await expect(page.locator('#step-3')).toBeVisible();

    // Pre-flight: confirm we're on Payment with pip 4 active
    await expect(page.locator('#pip-4')).toHaveClass(/active/);

    // Click Back from the payment step. Back button is in #mfoot-confirm
    // and has onclick="goStepBack3()".
    await page.locator('button[onclick="goStepBack3()"]').click();

    // Step 2b (Emergency contact) should reappear
    await expect(page.locator('#step-2b')).toBeVisible();
    await expect(page.locator('#step-3')).toBeHidden();

    // -- Pips 1 and 2 retain ticks --
    for (const n of [1, 2]) {
      await expect(page.locator(`#pip-${n}`)).toHaveClass(/done/);
      await expect(page.locator(`#pip-${n}`)).not.toHaveClass(/active/);
      await expect(page.locator(`#pip-${n}`)).toHaveText('\u2713');
    }

    // -- Pip 3 reactivated --
    await expect(page.locator('#pip-3')).toHaveClass(/active/);
    await expect(page.locator('#pip-3')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-3')).toHaveText('3');
    await expect(page.locator('#pip-lbl-3')).toHaveClass(/active/);

    // -- Pip 4 dim again --
    await expect(page.locator('#pip-4')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-4')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-4')).toHaveText('4');

    // -- Connectors 1 and 2 still done; connector 3 no longer done --
    await expect(page.locator('#conn-1')).toHaveClass(/done/);
    await expect(page.locator('#conn-2')).toHaveClass(/done/);
    await expect(page.locator('#conn-3')).not.toHaveClass(/done/);

    // -- Modal scrolled to top --
    await expect.poll(
      async () => await page.locator('.overlay.on .modal').evaluate(el => el.scrollTop),
      { timeout: 2000 }
    ).toBeLessThanOrEqual(2);
  });

});
