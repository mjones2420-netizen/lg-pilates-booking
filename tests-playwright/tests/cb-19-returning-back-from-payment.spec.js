// CB-19 — Step indicator: Returning client Back reactivates Step 1
//
// A returning client reaches Step 3 (Payment in 2-step layout) and clicks
// Back. Verifies:
//   - Step 1 (Your Details) reappears
//   - Pip 1 reactivates (.active, shows "1")
//   - Pip 2 dims (no .active, no .done) — the "Payment" pip
//   - Pip 2 label still reads "Payment" (returning-client transformation
//     persists across back/forward)
//   - Pip wrappers 3 and 4 still hidden, connectors 2 and 3 still hidden
//   - Connector 1 no longer .done
//   - Modal scrolls to top

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1 } = require('./helpers/booking-flow');

test.describe('CB-19 — Returning client Back from Payment', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('returns to Step 1, pip 1 reactivates, layout still 2-step', async ({ page }) => {
    await openBookingModal(page, 'Wednesday', 'current');

    await fillStep1(page, {
      firstName: 'Returning',
      lastName:  'Two',
      email:     'returning-two@test.example',
      phone:     '07700900222'
    });

    // Land on Payment in 2-step layout
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#pip-2')).toHaveClass(/active/);

    // Click Back
    await page.locator('button[onclick="goStepBack3()"]').click();

    // Step 1 should reappear
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-3')).toBeHidden();

    // -- Pip 1 reactivated, shows "1" --
    await expect(page.locator('#pip-1')).toHaveClass(/active/);
    await expect(page.locator('#pip-1')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-1')).toHaveText('1');
    await expect(page.locator('#pip-lbl-1')).toHaveClass(/active/);

    // -- Pip 2 dim, label still "Payment" --
    await expect(page.locator('#pip-2')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-2')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-2')).toHaveText('2');
    await expect(page.locator('#pip-lbl-2')).toHaveText('Payment');

    // -- 2-step layout still in place --
    await expect(page.locator('#pip-wrap-3')).toBeHidden();
    await expect(page.locator('#pip-wrap-4')).toBeHidden();
    await expect(page.locator('#conn-2')).toBeHidden();
    await expect(page.locator('#conn-3')).toBeHidden();

    // -- Connector 1 no longer .done --
    await expect(page.locator('#conn-1')).not.toHaveClass(/done/);

    // -- Modal scrolled to top --
    await expect.poll(
      async () => await page.locator('.overlay.on .modal').evaluate(el => el.scrollTop),
      { timeout: 2000 }
    ).toBeLessThanOrEqual(2);
  });

});
