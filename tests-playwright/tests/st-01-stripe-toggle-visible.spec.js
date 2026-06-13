const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { resetPaymentMode } = require('./helpers/admin-db');

test.beforeEach(async () => {
  await resetPaymentMode();
});

test('ST-01: payment mode toggle is visible in admin Settings', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  await expect(page.locator('#pmode-bt')).toBeVisible();
  await expect(page.locator('#pmode-stripe')).toBeVisible();
  await expect(page.locator('#pmode-bt')).toBeChecked();
});
