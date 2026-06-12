// SE-10 — Notification email field loads on dashboard login
// Verifies that the admin_email value stored in the settings table is loaded
// into the #setting-admin-email input when the admin logs in.
// Cleanup: afterEach restores the original admin_email value.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { Pool } = require('pg');

const ORIG_EMAIL = 'mjones970@live.co.uk';

let pool;

test.beforeAll(() => {
  pool = new Pool({ connectionString: process.env.TEST_SUPABASE_DB_URL });
});

test.afterAll(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query(`
    INSERT INTO settings (key, value) VALUES ('admin_email', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [ORIG_EMAIL]);
});

test.afterEach(async () => {
  await pool.query(`
    INSERT INTO settings (key, value) VALUES ('admin_email', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [ORIG_EMAIL]);
});

test('SE-10 — notification email field is populated on dashboard load', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  await loginAsAdmin(page);

  // Navigate to Settings page
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings.on')).toBeVisible();
  await expect(page.locator('#setting-admin-email')).toHaveValue(ORIG_EMAIL);
});
