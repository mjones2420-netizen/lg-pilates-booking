// SE-01 — Save bank details
// Verifies that an admin can enter bank name, sort code, and account number in the
// Settings section and save them successfully. Confirms the toast fires and the
// displayed values in the admin inputs update immediately.
// Cleanup: afterEach restores the original values so other specs see a known state.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { Pool } = require('pg');

const ORIG = { name: 'Test Bank', sort: '01-02-03', acc: '12345678' };
const NEW  = { name: 'SE01 Bank', sort: '99-88-77', acc: '00000001' };

let pool;

test.beforeAll(() => {
  pool = new Pool({ connectionString: process.env.TEST_SUPABASE_DB_URL });
});

test.afterAll(async () => {
  await pool.end();
});

test.beforeEach(async ({ page }) => {
  // Seed known starting values directly so the test is idempotent
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('bank_name', $1), ('bank_sort_code', $2), ('bank_account_no', $3)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [ORIG.name, ORIG.sort, ORIG.acc]);
});

test.afterEach(async () => {
  // Restore original values regardless of pass/fail
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('bank_name', $1), ('bank_sort_code', $2), ('bank_account_no', $3)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [ORIG.name, ORIG.sort, ORIG.acc]);
});

test('SE-01 — admin saves bank details and sees confirmation toast', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  await loginAsAdmin(page);

  // Scroll to Settings section
  await page.locator('#setting-bank-name').scrollIntoViewIfNeeded();

  // Clear and enter new values
  await page.locator('#setting-bank-name').fill(NEW.name);
  await page.locator('#setting-bank-sort').fill(NEW.sort);
  await page.locator('#setting-bank-acc').fill(NEW.acc);

  // Click Save Bank Details
  await page.locator('button[onclick="saveSettings()"]').click();

  // Toast confirms save
  await expect(page.locator('#toastEl')).toContainText('Bank details saved!');

  // DB should now hold new values
  const { rows } = await pool.query(
    `SELECT key, value FROM settings WHERE key IN ('bank_name','bank_sort_code','bank_account_no') ORDER BY key`
  );
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  expect(map.bank_name).toBe(NEW.name);
  expect(map.bank_sort_code).toBe(NEW.sort);
  expect(map.bank_account_no).toBe(NEW.acc);
});
