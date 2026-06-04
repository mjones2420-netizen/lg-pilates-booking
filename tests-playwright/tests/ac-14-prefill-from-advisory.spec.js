// AC-14 — Auto start date prefill from advisory warning
// Verifies that clicking "+ Add Block" from the yellow advisory banner pre-fills the
// Block Start Date field with end_date + 7 days (the same weekday as the class).
// The day-of-week validation green tick should also fire automatically.
//
// Setup: Uses the clean fixture Wednesday class (class_id=2) which is in the advisory
// state. The prefill date is the wed-upcoming block's end_date + 7 days.
// The #ab-date-val element should show a green tick (not a red error) after prefill.
// No DB state is created.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');

test.describe('AC-14 — Auto start date prefill from advisory warning', () => {

  test('yellow advisory Add Block button prefills start date with end_date + 7 days', async ({ page }) => {
    // Look up the wed-upcoming block to know its end_date
    const wedBlock = await getBlockByRole('wed-upcoming');

    // Calculate expected prefill: end_date + 7 days (using local date arithmetic)
    const endDate = new Date(wedBlock.end_date + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 7);
    const expectedYear  = endDate.getFullYear();
    const expectedMonth = String(endDate.getMonth() + 1).padStart(2, '0');
    const expectedDay   = String(endDate.getDate()).padStart(2, '0');
    const expectedPrefill = `${expectedYear}-${expectedMonth}-${expectedDay}`;

    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);

    await loginAsAdmin(page);

    const warnings = page.locator('#block-warnings');
    await expect(warnings).toBeVisible();

    // Find the yellow advisory banner and click its "+ Add Block"
    const yellowBanner = warnings.locator('.block-warning', {
      hasText: 'no next block'
    }).first();
    await expect(yellowBanner).toBeVisible();

    const addBlockBtn = yellowBanner.locator('button', { hasText: '+ Add Block' }).first();
    await addBlockBtn.click();

    const modal = page.locator('#add-block-overlay');
    await expect(modal).toBeVisible();

    // Start date field should be pre-filled
    const startField = page.locator('#ab-start');
    await expect(startField).toHaveValue(expectedPrefill);

    // Day validation should have fired — #ab-date-val should be visible
    // and should NOT contain a red error (it should show the green tick / day confirmation)
    const dateVal = page.locator('#ab-date-val');
    await expect(dateVal).toBeVisible();
    const dateValText = await dateVal.textContent();
    // validateAbDate() shows "✓ Wednesday confirmed." (or whatever weekday) on success
    expect(dateValText).toMatch(/confirmed/i);
    expect(dateValText).not.toMatch(/Please pick/i);  // no day-mismatch error

    // Field should still be editable
    await startField.fill('');
    await expect(startField).toHaveValue('');
  });

});
