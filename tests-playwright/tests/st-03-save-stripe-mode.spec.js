const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');

test('ST-03: save payment mode as Stripe with publishable key persists correctly', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  await page.locator('#pmode-stripe').click();
  await expect(page.locator('#stripe-pk-field')).toBeVisible();
  await page.locator('#setting-stripe-pk').fill('pk_test_st03key');
  await page.locator('.db-settings-card').filter({ hasText: 'Payment method' })
    .locator('button', { hasText: 'Save Settings' }).click();
  await expect(page.locator('.toast')).toContainText('Settings saved');
  await expect(page.locator('#stripe-mode-badge')).toBeVisible();

  // Reload and verify persisted
  await page.reload();
  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#pmode-stripe')).toBeChecked();
  await expect(page.locator('#setting-stripe-pk')).toHaveValue('pk_test_st03key');
  await expect(page.locator('#stripe-mode-badge')).toBeVisible();

  // Cleanup
  await sb.from('settings').upsert([
    { key: 'payment_mode', value: 'bank_transfer' },
    { key: 'stripe_publishable_key', value: '' }
  ]);
});
