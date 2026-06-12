// SE-11 — Notification email field saves and persists
// Verifies that an admin can update the notification email address in the Settings
// section, save it, and have the new value persisted to the database.
// Cleanup: afterEach restores the original admin_email value.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { Pool } = require('pg');

const ORIG_EMAIL = 'mjones970@live.co.uk';
const NEW_EMAIL  = 'se11-test@test.example';

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

test('SE-11 — admin saves notification email and value persists to DB', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  await loginAsAdmin(page);

  // Navigate to Settings page
  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings.on')).toBeVisible();
  await page.locator('#setting-admin-email').fill(NEW_EMAIL);

  await page.locator('button[onclick="saveSettings()"]').nth(1).click();
  await expect(page.locator('#toastEl')).toContainText('Settings saved!');

  // Confirm value persisted in DB
  const { rows } = await pool.query(
    `SELECT value FROM settings WHERE key = 'admin_email'`
  );
  expect(rows[0].value).toBe(NEW_EMAIL);
});
