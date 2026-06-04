// AC-19 to AC-22 — Auto am/pm time formatting
// Verifies the onTimeBlur() / formatTimeInput() function converts time inputs correctly
// in both the Start Time (#ac-time) and End Time (#ac-end) fields of the Add New Class modal.
//
// AC-19: 24hr input (18:30) → "6:30pm" on blur
// AC-20: Bare hour:minute without suffix (9:45) → "9:45am" on blur
// AC-21: Already-formatted input (10:00am) → unchanged on blur
// AC-22: End Time field (#ac-end) also converts 24hr (19:15 → "7:15pm")
//
// No DB state is created. The Add New Class modal is opened and closed without saving.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

test.describe('AC-19 to AC-22 — Auto am/pm time formatting', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);
    await loginAsAdmin(page);

    // Open the Add New Class modal
    await page.locator('button', { hasText: '+ Add New Class' }).click();
    await expect(page.locator('#add-class-overlay')).toBeVisible();
  });

  test('AC-19 — 24hr time (18:30) is converted to 6:30pm on blur', async ({ page }) => {
    const timeField = page.locator('#ac-time');
    await timeField.fill('18:30');
    await timeField.blur();
    await expect(timeField).toHaveValue('6:30pm');
  });

  test('AC-20 — bare hour:minute (9:45) gets am suffix added on blur', async ({ page }) => {
    const timeField = page.locator('#ac-time');
    await timeField.fill('9:45');
    await timeField.blur();
    await expect(timeField).toHaveValue('9:45am');
  });

  test('AC-21 — already-formatted input (10:00am) is left unchanged on blur', async ({ page }) => {
    const timeField = page.locator('#ac-time');
    await timeField.fill('10:00am');
    await timeField.blur();
    await expect(timeField).toHaveValue('10:00am');
  });

  test('AC-22 — End Time field also converts 24hr (19:15 → 7:15pm)', async ({ page }) => {
    const endField = page.locator('#ac-end');
    await endField.fill('19:15');
    await endField.blur();
    await expect(endField).toHaveValue('7:15pm');
  });

});
