const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');

test('SE-18: payment mode card is visible on Settings page', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

  await loginAsAdmin(page);
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings')).toHaveClass(/on/);

  // Payment method card present
  const card = page.locator('.db-settings-card').filter({ hasText: 'Payment method' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Choose how clients pay for their bookings');

  // Both radio options present
  await expect(page.locator('#pmode-bt')).toBeVisible();
  await expect(page.locator('#pmode-stripe')).toBeVisible();
  await expect(card).toContainText('Bank transfer');
  await expect(card).toContainText('Card payments (Stripe)');
});
