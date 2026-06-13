const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { resetPaymentMode } = require('./helpers/admin-db');

test.beforeEach(async () => {
  await resetPaymentMode();
});

test.afterEach(async () => {
  await resetPaymentMode();
});

test('ST-16: STRIPE MODE badge visible in topbar when Stripe mode is active', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  // Badge hidden in bank transfer mode
  await expect(page.locator('#stripe-mode-badge')).toBeHidden();

  // Switch to Stripe and save
  await page.locator('#pmode-stripe').click();
  await page.locator('#setting-stripe-pk').fill('pk_test_st16badge');
  await page.locator('.db-settings-card').filter({ hasText: 'Payment method' })
    .locator('button', { hasText: 'Save Settings' }).click();
  await expect(page.locator('.toast')).toContainText('Settings saved');

  // Badge now visible
  await expect(page.locator('#stripe-mode-badge')).toBeVisible();
  await expect(page.locator('#stripe-mode-badge')).toContainText('Stripe mode');

  // Badge persists on reload
  await page.reload();
  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#stripe-mode-badge')).toBeVisible();
});
