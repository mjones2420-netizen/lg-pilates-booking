// SE-09 — CSV export formula injection protection
// Verifies that customer names beginning with formula-triggering characters
// (=, +, -, @) are escaped with a leading apostrophe in the exported CSV.
// Creates a throwaway customer with first_name starting with '=' directly via pg,
// exports the customers CSV, reads the raw file, and asserts the apostrophe prefix.
// Cleanup: deletes the test customer in afterEach.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const fs = require('fs');
const { Pool } = require('pg');

const INJECTION_EMAIL = 'se09-formula@test.example';
const INJECTION_NAME  = '=HYPERLINK("http://evil.com")';

let pool;
let injectionCustomerId = null;

test.beforeAll(() => {
  pool = new Pool({ connectionString: process.env.TEST_SUPABASE_DB_URL });
});

test.afterAll(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  injectionCustomerId = null;
  const { rows } = await pool.query(`
    INSERT INTO customers (first_name, last_name, email, phone, customer_type)
    VALUES ($1, 'InjectionTest', $2, '07000000000', 'returning')
    ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
    RETURNING id
  `, [INJECTION_NAME, INJECTION_EMAIL]);
  injectionCustomerId = rows[0].id;
});

test.afterEach(async () => {
  if (injectionCustomerId) {
    await pool.query(`DELETE FROM customers WHERE id = $1`, [injectionCustomerId]);
    injectionCustomerId = null;
  }
});

test('SE-09 — formula injection character is escaped with apostrophe in exported CSV', async ({ page }) => {
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

  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');

  // The raw CSV must contain the escaped form: leading apostrophe before '='
  // rowsToCsv prefixes ' to any value starting with =, +, -, @, tab, or CR
  expect(content).toContain("'=HYPERLINK");

  // The un-escaped form must NOT appear as a standalone cell value
  // (i.e. a line should not start with '=HYPERLINK' without the apostrophe prefix)
  const lines = content.split('\n');
  const hasUnescaped = lines.some(line =>
    line.split(',').some(cell => cell === '=HYPERLINK("http://evil.com")')
  );
  expect(hasUnescaped).toBe(false);
});
