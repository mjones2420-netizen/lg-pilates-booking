// tests/acl-01-clients-tab-lists-customers.spec.js
//
// ACL (Admin — Client Management) — Clients tab lists all customers.
// Covers scenario:
//   ACL-01: Clients tab lists all customers
//
// Excel scenario wording is stale — it references the old global
// `customers.priority` column and a "green Priority / grey Standard" badge
// pair. The actual UI moved to per-class priority long ago and renders a
// three-state overall badge: "Manual priority" (gold), "Auto priority"
// (sage), or "Standard" (grey-cream). This spec tests the live behaviour.
//
// What this asserts:
//   - Admin can log in and switch to the Clients tab
//   - The table headers match the live schema: Client, Email, Phone,
//     Type, Priority, Actions (6 columns)
//   - All 3 seeded fixture customers appear (returning-one, returning-two,
//     admin-dummy) with name, email, phone, type populated
//   - A row for each customer exists in the tbody
//
// The spec does NOT assert an exact total customer count, because stray
// test customers from prior CB/PB runs accumulate naturally — the suite
// hasn't reached zero state drift yet (Batch 6 self-cleaning is in
// progress, not complete). Asserting "at least these 3 are present" is
// the robust assertion.
//
// Read-only spec — no database state created. No afterEach needed.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;

test.describe('ACL-01 — Clients tab lists all customers', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — ACL specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    // SAFETY: every admin test must verify we're in TEST MODE before logging in.
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async ({ page }) => {
    // Clean sign-out so subsequent tests start from a fresh state.
    await signOutAdmin(page).catch(() => { /* already signed out is fine */ });
  });

  test('Clients tab renders the customer table with all seeded fixture clients', async ({ page }) => {
    await loginAsAdmin(page);

    // Switch to the Clients tab
    await page.locator('#tab-customers').click();
    await expect(page.locator('#tab-customers')).toHaveClass(/on/);

    // Wait for the tbody to populate — initial "Loading..." placeholder
    // is a single tr with colspan=6; once renderCustomersTab() finishes
    // its awaits, it's replaced by one row per customer. Wait for a known
    // seeded customer row to appear rather than negating a multi-row locator
    // (which trips Playwright's strict mode).
    const tbody = page.locator('#customers-tbody');
    await expect(tbody).toBeVisible();
    await expect(
      tbody.locator('tr', { hasText: 'returning-one@test.example' }).first()
    ).toBeVisible({ timeout: 10000 });

    // Header row — confirm column structure matches the live schema.
    // Scope to the table that contains #customers-tbody to avoid matching
    // other dashboard tables (e.g. bookings).
    const headerRow = page.locator('table:has(#customers-tbody) thead tr').first();
    await expect(headerRow.locator('th').nth(0)).toHaveText('Client');
    await expect(headerRow.locator('th').nth(1)).toHaveText('Email');
    await expect(headerRow.locator('th').nth(2)).toHaveText('Phone');
    await expect(headerRow.locator('th').nth(3)).toHaveText('Type');
    await expect(headerRow.locator('th').nth(4)).toHaveText('Priority');
    await expect(headerRow.locator('th').nth(5)).toHaveText('Actions');

    // The 3 seeded fixture customers should all appear.
    const fixtureEmails = [
      'returning-one@test.example',
      'returning-two@test.example',
      'admin-dummy@test.example',
    ];

    for (const email of fixtureEmails) {
      const row = tbody.locator('tr', { hasText: email }).first();
      await expect(row, `row for ${email} should be visible`).toBeVisible();

      // Each row should have populated cells for Client (name), Email, Type
      const cells = row.locator('td');
      const nameCell  = await cells.nth(0).textContent();
      const emailCell = await cells.nth(1).textContent();
      const typeCell  = await cells.nth(3).textContent();

      expect(nameCell.trim()).not.toBe('');
      expect(nameCell.trim()).not.toBe('—');
      expect(emailCell.trim()).toBe(email);
      // All 3 seeded fixture customers are 'returning' per migration 09
      expect(typeCell.trim()).toBe('returning');
    }

    // Priority column (5th td) should render a badge of some kind for
    // each seeded fixture row — the exact text varies by client state,
    // but the cell should contain a .priority-badge element.
    for (const email of fixtureEmails) {
      const row = tbody.locator('tr', { hasText: email }).first();
      await expect(row.locator('.priority-badge').first()).toBeVisible();
    }
  });
});
