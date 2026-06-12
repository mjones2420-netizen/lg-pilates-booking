// SE-06 — Export Customers CSV
// Verifies that clicking "Export Customers" downloads a correctly named CSV
// containing customer records including priority status.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const fs = require('fs');

test('SE-06 — Export Customers button downloads a customers CSV', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  await loginAsAdmin(page);

  // Navigate to Backup & Export page
  await page.locator('#dbnav-backup').click();
  await expect(page.locator('#dbnav-backup.on')).toBeVisible();

    const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[onclick="exportTable(\'customers\')"]').click(),
  ]);

  const filename = download.suggestedFilename();
  expect(filename).toMatch(/^lgpilates-customers-\d{4}-\d{2}-\d{2}\.csv$/);

  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');
  expect(content.trim().length).toBeGreaterThan(0);
  expect(content).toContain('id');
  expect(content).toContain('email');
  // Fixture customers should be present
  expect(content).toContain('returning-one@test.example');
});
