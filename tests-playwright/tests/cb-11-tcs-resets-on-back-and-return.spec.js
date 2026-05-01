// CB-11: T&Cs — Checkbox resets on Back and Return
//
// Verifies that if a customer ticks the T&Cs, navigates Back from Step 3
// (to Step 2b in the new-client flow), then comes forward to Step 3 again,
// the checkbox is unticked and the Reserve button is disabled. The customer
// must explicitly re-agree to the terms — agreement does not persist
// across navigation.
//
// This is implemented in goStep3() which resets the checkbox on every entry.
//
// Excel scenario: CB-11 — T&Cs — Checkbox resets on Back and Return
// Manual reproduction: reach Step 3 → tick → click Back → click Continue
// from Step 2b → checkbox is unticked, button disabled.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  uniqueTestEmail
} = require('./helpers/booking-flow');

test.describe('CB-11: T&Cs — Checkbox resets on Back and Return', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner missing — refusing to run against production').toBeVisible();
  });

  test('T&Cs checkbox is cleared when returning to Step 3 after Back', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');
    expect(monUpcoming, 'fixture: mon-upcoming block must exist').toBeTruthy();

    // Drive to Step 3
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'CB11',
      lastName: 'Tester',
      email: uniqueTestEmail(11),
      phone: '07700901111'
    });
    await fillStep2Medical(page, { printName: 'CB11 Tester' });
    await fillStep2Emergency(page);

    await expect(page.locator('#step-3')).toBeVisible();

    // Tick the T&Cs to confirm we're starting from a "ticked" state
    await page.locator('#tcs-agree').check();
    await expect(page.locator('#tcs-agree')).toBeChecked();
    await expect(page.locator('#reserve-btn')).toBeEnabled();

    // Click Back — should land us on Step 2b (Emergency Contact)
    await page.locator('#step-3 .step-btn-back', { hasText: 'Back' }).click();
    await expect(page.locator('#step-2b')).toBeVisible();
    await expect(page.locator('#step-3')).toBeHidden();

    // Click Continue from Step 2b → back to Step 3
    await page.locator('#step-2b .step-btn', { hasText: 'Continue' }).click();
    await expect(page.locator('#step-3')).toBeVisible();

    // Verify the checkbox is unticked and the button disabled
    await expect(page.locator('#tcs-agree')).not.toBeChecked();
    await expect(page.locator('#reserve-btn')).toBeDisabled();
    await expect(page.locator('#tcs-hint')).toBeVisible();
  });
});
