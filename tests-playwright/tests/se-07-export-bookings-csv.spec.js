// SE-07 — Export Bookings CSV
// Verifies that clicking "Export Bookings" downloads a correctly named CSV
// containing booking records with statuses and amounts.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const fs = require('fs');

test('SE-07 — Export Bookings button downloads a bookings CSV', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  await loginAsAdmin(page);

  await page.locator('button[onclick="exportTable(\'bookings\')"]').scrollIntoViewIfNeeded();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[onclick="exportTable(\'bookings\')"]').click(),
  ]);

  const filename = download.suggestedFilename();
  expect(filename).toMatch(/^lgpilates-bookings-\d{4}-\d{2}-\d{2}\.csv$/);

  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');
  expect(content.trim().length).toBeGreaterThan(0);
  expect(content).toContain('id');
  expect(content).toContain('status');
  expect(content).toContain('amount_due');
});
