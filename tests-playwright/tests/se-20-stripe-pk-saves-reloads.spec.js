const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');

test('SE-20: Stripe publishable key saves and reloads correctly', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  // Select Stripe mode and enter key
  await page.locator('#pmode-stripe').click();
  await expect(page.locator('#stripe-pk-field')).toBeVisible();
  const testKey = 'pk_test_se20persistkey';
  await page.locator('#setting-stripe-pk').fill(testKey);

  // Key field is masked (password type) by default
  await expect(page.locator('#setting-stripe-pk')).toHaveAttribute('type', 'password');

  // Toggle visibility
  await page.locator('#stripe-pk-toggle').click();
  await expect(page.locator('#setting-stripe-pk')).toHaveAttribute('type', 'text');
  await page.locator('#stripe-pk-toggle').click();
  await expect(page.locator('#setting-stripe-pk')).toHaveAttribute('type', 'password');

  // Save
  await page.locator('.db-settings-card').filter({ hasText: 'Payment method' })
    .locator('button', { hasText: 'Save Settings' }).click();
  await expect(page.locator('.toast')).toContainText('Settings saved');

  // Reload and verify key persisted
  await page.reload();
  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#pmode-stripe')).toBeChecked();
  await expect(page.locator('#setting-stripe-pk')).toHaveValue(testKey);

  // Cleanup
  await sb.from('settings').upsert([
    { key: 'payment_mode', value: 'bank_transfer' },
    { key: 'stripe_publishable_key', value: '' }
  ]);
});
