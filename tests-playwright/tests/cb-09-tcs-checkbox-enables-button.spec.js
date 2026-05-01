// CB-09: T&Cs — Checkbox activates Reserve button
//
// Verifies that ticking the T&Cs checkbox on Step 3 enables the Reserve
// button and hides the hint text. This is the positive case of the T&Cs
// gate — once the customer agrees, they can proceed.
//
// Excel scenario: CB-09 — T&Cs — Checkbox activates Reserve button
// Manual reproduction: reach Step 3 → tick the checkbox → button enabled.

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

test.describe('CB-09: T&Cs — Checkbox activates Reserve button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner missing — refusing to run against production').toBeVisible();
  });

  test('Ticking T&Cs enables Reserve button and hides hint', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');
    expect(monUpcoming, 'fixture: mon-upcoming block must exist').toBeTruthy();

    // Drive to Step 3
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'CB09',
      lastName: 'Tester',
      email: uniqueTestEmail(9),
      phone: '07700900909'
    });
    await fillStep2Medical(page, { printName: 'CB09 Tester' });
    await fillStep2Emergency(page);

    await expect(page.locator('#step-3')).toBeVisible();

    // Confirm starting state
    await expect(page.locator('#reserve-btn')).toBeDisabled();
    await expect(page.locator('#tcs-hint')).toBeVisible();

    // Tick the checkbox
    await page.locator('#tcs-agree').check();

    // Button should now be enabled
    await expect(page.locator('#tcs-agree')).toBeChecked();
    await expect(page.locator('#reserve-btn')).toBeEnabled();

    // Hint should be hidden
    await expect(page.locator('#tcs-hint')).toBeHidden();
  });
});
