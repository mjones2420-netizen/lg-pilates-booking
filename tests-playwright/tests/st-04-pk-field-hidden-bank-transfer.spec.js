const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { resetPaymentMode } = require('./helpers/admin-db');

test.beforeEach(async () => {
  await resetPaymentMode();
});

test('ST-04: Stripe publishable key field hidden when bank transfer is selected', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  await expect(page.locator('#pmode-bt')).toBeChecked();
  await expect(page.locator('#stripe-pk-field')).toBeHidden();

  await page.locator('#pmode-stripe').click();
  await expect(page.locator('#stripe-pk-field')).toBeVisible();

  await page.locator('#pmode-bt').click();
  await expect(page.locator('#stripe-pk-field')).toBeHidden();
});
