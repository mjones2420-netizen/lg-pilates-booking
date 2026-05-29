// SE-05 — Export Blocks CSV
// Verifies that clicking "Export Blocks" downloads a correctly named CSV
// containing block records (dates, price, cap, booked count).

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const fs = require('fs');

test('SE-05 — Export Blocks button downloads a blocks CSV', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  await loginAsAdmin(page);

  await page.locator('button[onclick="exportTable(\'blocks\')"]').scrollIntoViewIfNeeded();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[onclick="exportTable(\'blocks\')"]').click(),
  ]);

  const filename = download.suggestedFilename();
  expect(filename).toMatch(/^lgpilates-blocks-\d{4}-\d{2}-\d{2}\.csv$/);

  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');
  expect(content.trim().length).toBeGreaterThan(0);
  expect(content).toContain('id');
  // Blocks table includes these key columns
  expect(content).toContain('cap');
  expect(content).toContain('booked');
  expect(content).toContain('price');
});
