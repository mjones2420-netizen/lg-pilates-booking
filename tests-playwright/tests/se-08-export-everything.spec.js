// SE-08 — Export Everything — full backup
// Verifies that clicking "Export Everything" downloads a single file named
// lgpilates-full-backup-[date].csv containing all 5 table section headers
// (### TABLE: CLASSES ###, BLOCKS, CUSTOMERS, BOOKINGS, PARQ).

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const fs = require('fs');

test('SE-08 — Export Everything downloads a full backup CSV with all 5 table sections', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  await loginAsAdmin(page);

  // Navigate to Backup & Export page
  await page.locator('#dbnav-backup').click();
  await expect(page.locator('#dbnav-backup.on')).toBeVisible();

    const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[onclick="exportAll()"]').click(),
  ]);

  const filename = download.suggestedFilename();
  expect(filename).toMatch(/^lgpilates-full-backup-\d{4}-\d{2}-\d{2}\.csv$/);

  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');
  expect(content.trim().length).toBeGreaterThan(0);

  // All 5 section headers must be present
  expect(content).toContain('### TABLE: CLASSES');
  expect(content).toContain('### TABLE: BLOCKS');
  expect(content).toContain('### TABLE: CUSTOMERS');
  expect(content).toContain('### TABLE: BOOKINGS');
  expect(content).toContain('### TABLE: PARQ');

  // Export status message confirms success
  await expect(page.locator('#export-status')).toContainText('Full backup downloaded', { timeout: 6000 });
});
