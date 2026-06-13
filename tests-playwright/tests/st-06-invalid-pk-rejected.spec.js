const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { resetPaymentMode } = require('./helpers/admin-db');

test.beforeEach(async () => {
  await resetPaymentMode();
});

test('ST-06: invalid Stripe publishable key is rejected on save', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  await page.locator('#pmode-stripe').click();
  await expect(page.locator('#stripe-pk-field')).toBeVisible();

  // Save with no key — should error
  await page.locator('.db-settings-card').filter({ hasText: 'Payment method' })
    .locator('button', { hasText: 'Save Settings' }).click();
  await expect(page.locator('.toast')).toContainText('Please enter your Stripe publishable key');

  // Save with key that doesn't start with pk_ — should error
  await page.locator('#setting-stripe-pk').fill('sk_test_notapublishablekey');
  await page.locator('.db-settings-card').filter({ hasText: 'Payment method' })
    .locator('button', { hasText: 'Save Settings' }).click();
  await expect(page.locator('.toast')).toContainText('must start with pk_');
});
