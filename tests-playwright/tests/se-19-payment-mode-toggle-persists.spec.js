const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');

test('SE-19: toggling payment mode to Stripe and back persists correctly', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  // Switch to Stripe, enter a key, save
  await page.locator('#pmode-stripe').click();
  await expect(page.locator('#stripe-pk-field')).toBeVisible();
  await page.locator('#setting-stripe-pk').fill('pk_test_se19testkey');
  await page.locator('.db-settings-card').filter({ hasText: 'Payment method' })
    .locator('button', { hasText: 'Save Settings' }).click();
  await expect(page.locator('.toast')).toContainText('Settings saved');

  // Stripe mode badge appears
  await expect(page.locator('#stripe-mode-badge')).toBeVisible();

  // Reload — Stripe should still be selected
  await page.reload();
  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#pmode-stripe')).toBeChecked();
  await expect(page.locator('#stripe-pk-field')).toBeVisible();
  await expect(page.locator('#stripe-mode-badge')).toBeVisible();

  // Switch back to bank transfer
  await page.locator('#pmode-bt').click();
  await page.locator('.db-settings-card').filter({ hasText: 'Payment method' })
    .locator('button', { hasText: 'Save Settings' }).click();
  await expect(page.locator('.toast')).toContainText('Settings saved');
  await expect(page.locator('#stripe-mode-badge')).toBeHidden();

  // Cleanup — reset to bank_transfer in DB
  await sb.from('settings').upsert([{ key: 'payment_mode', value: 'bank_transfer' }]);
});
