// SE-21 — a failed settings save shows an error toast, not "Settings saved!" (#51)
// Before #51, saveSettings() ran `await sb.from('settings').upsert(rows)` and never
// checked the returned error. If the session had expired, the write silently failed
// (RLS denies anon) yet the UI still flashed "Settings saved!" — Louise would believe
// bank details had changed when they had not. This signs the admin out mid-page (so the
// write runs as anon and RLS rejects it), triggers the save, and asserts the error toast.
// The DB write never succeeds, so no cleanup of settings is needed; beforeEach/afterEach
// keep the bank fields at a known baseline for other specs.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { Pool } = require('pg');

const BASE = { name: 'Test Bank', sort: '01-02-03', acc: '12345678' };

let pool;
test.beforeAll(() => { pool = new Pool({ connectionString: process.env.TEST_SUPABASE_DB_URL }); });
test.afterAll(async () => { await pool.end(); });

async function seedBank() {
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('bank_name', $1), ('bank_sort_code', $2), ('bank_account_no', $3)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [BASE.name, BASE.sort, BASE.acc]);
}

test.beforeEach(seedBank);
test.afterEach(seedBank);

test('SE-21 — signed-out save is rejected and shows an error toast', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
  await loginAsAdmin(page);

  await page.locator('#dbnav-settings').click();
  await expect(page.locator('#dbnav-settings.on')).toBeVisible();

  // Bank inputs are populated from the DB on load; change one so the save has work to do.
  await page.locator('#setting-bank-name').fill('SE21 Should Not Persist');

  // Drop the session directly (no app navigation) so the upsert runs as anon.
  await page.evaluate(async () => { await sb.auth.signOut(); });

  // Trigger the save. With #51 the unchecked-error bug is gone: RLS rejects the anon
  // write, the error is thrown, and the catch shows the failure toast.
  await page.evaluate(() => saveSettings());

  await expect(page.locator('#toastEl')).toContainText('Error saving settings.', { timeout: 5000 });
  await expect(page.locator('#toastEl')).not.toContainText('Settings saved!');

  // The DB must still hold the baseline value — the failed save changed nothing.
  const { rows } = await pool.query(`SELECT value FROM settings WHERE key = 'bank_name'`);
  expect(rows[0].value).toBe(BASE.name);
});
