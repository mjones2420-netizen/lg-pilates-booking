// SE-04 — Export Classes CSV
// Verifies that clicking "Export Classes" in the admin Backup & Export section
// triggers a file download named lgpilates-classes-[date].csv containing class data.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const fs = require('fs');

test('SE-04 — Export Classes button downloads a classes CSV', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  await loginAsAdmin(page);

  // Scroll export buttons into view
  await page.locator('button[onclick="exportTable(\'classes\')"]').scrollIntoViewIfNeeded();

  // Intercept download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[onclick="exportTable(\'classes\')"]').click(),
  ]);

  const filename = download.suggestedFilename();
  expect(filename).toMatch(/^lgpilates-classes-\d{4}-\d{2}-\d{2}\.csv$/);

  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');
  expect(content.trim().length).toBeGreaterThan(0);
  // Header row should contain known classes columns
  expect(content).toContain('id');
  expect(content).toContain('name');
});
