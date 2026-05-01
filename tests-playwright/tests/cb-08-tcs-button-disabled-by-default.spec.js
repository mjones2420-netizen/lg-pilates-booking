// CB-08: T&Cs — Reserve button disabled by default
//
// Verifies that when a new client first reaches Step 3 (the payment screen),
// the Reserve button is disabled, the hint text is visible, and the T&Cs
// checkbox is unticked. This is the safety gate that prevents a customer
// from accidentally submitting a booking without agreeing to the terms.
//
// Excel scenario: CB-08 — T&Cs — Reserve button disabled by default
// Manual reproduction: open booking modal → fill Step 1, Step 2a, Step 2b
// → land on Step 3 → check button state.

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

test.describe('CB-08: T&Cs — Reserve button disabled by default', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner missing — refusing to run against production').toBeVisible();
  });

  test('Reserve button starts disabled with hint visible at Step 3 entry', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');
    expect(monUpcoming, 'fixture: mon-upcoming block must exist').toBeTruthy();

    // Drive a new client to Step 3
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'CB08',
      lastName: 'Tester',
      email: uniqueTestEmail(8),
      phone: '07700900808'
    });
    await fillStep2Medical(page, { printName: 'CB08 Tester' });
    await fillStep2Emergency(page);

    // We are now on Step 3 — verify the default state
    await expect(page.locator('#step-3')).toBeVisible();

    // Checkbox should be unticked
    await expect(page.locator('#tcs-agree')).not.toBeChecked();

    // Reserve button should be disabled
    await expect(page.locator('#reserve-btn')).toBeDisabled();

    // Hint should be visible (style="display:block" or default visible)
    const hint = page.locator('#tcs-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Please agree to the Terms');
  });
});
