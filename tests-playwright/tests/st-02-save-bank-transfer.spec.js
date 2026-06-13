const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');

test('ST-02: save payment mode as bank transfer persists correctly', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  // Ensure bank transfer is selected and save
  await page.locator('#pmode-bt').click();
  await page.locator('.db-settings-card').filter({ hasText: 'Payment method' })
    .locator('button', { hasText: 'Save Settings' }).click();
  await expect(page.locator('.toast')).toContainText('Settings saved');

  // Badge should not be visible in bank transfer mode
  await expect(page.locator('#stripe-mode-badge')).toBeHidden();

  // Reload and verify
  await page.reload();
  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#pmode-bt')).toBeChecked();
  await expect(page.locator('#stripe-pk-field')).toBeHidden();
});
