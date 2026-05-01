// CB-10: T&Cs — Unticking checkbox disables button again
//
// Verifies the inverse of CB-09: if the customer ticks then unticks the
// T&Cs checkbox, the Reserve button returns to disabled and the hint
// reappears. The gate must hold in both directions, otherwise a customer
// could untick by accident and still submit.
//
// Excel scenario: CB-10 — T&Cs — Unticking checkbox disables button again
// Manual reproduction: reach Step 3 → tick → untick → button disabled again.

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

test.describe('CB-10: T&Cs — Unticking checkbox disables button again', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner missing — refusing to run against production').toBeVisible();
  });

  test('Unticking T&Cs returns button to disabled and reveals hint', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');
    expect(monUpcoming, 'fixture: mon-upcoming block must exist').toBeTruthy();

    // Drive to Step 3
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'CB10',
      lastName: 'Tester',
      email: uniqueTestEmail(10),
      phone: '07700901010'
    });
    await fillStep2Medical(page, { printName: 'CB10 Tester' });
    await fillStep2Emergency(page);

    await expect(page.locator('#step-3')).toBeVisible();

    // Tick → button enabled
    await page.locator('#tcs-agree').check();
    await expect(page.locator('#reserve-btn')).toBeEnabled();
    await expect(page.locator('#tcs-hint')).toBeHidden();

    // Untick → button disabled again
    await page.locator('#tcs-agree').uncheck();
    await expect(page.locator('#tcs-agree')).not.toBeChecked();
    await expect(page.locator('#reserve-btn')).toBeDisabled();
    await expect(page.locator('#tcs-hint')).toBeVisible();
  });
});
