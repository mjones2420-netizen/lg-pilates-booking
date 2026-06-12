// tests/acl-02-priority-badges-display.spec.js
//
// ACL (Admin — Client Management) — Priority badges display correctly.
// Covers scenario:
//   ACL-02: Priority badges display correctly
//
// Excel scenario wording is stale — it references a two-state model
// ("green Priority / grey Standard") tied to the deprecated global
// `customers.priority` column. The live UI renders THREE distinct badge
// states in the overall Priority column, with manual > auto > standard
// precedence (see renderCustomersTab in index.html):
//
//   - Manual priority — gold, rendered when the customer has at least
//     one row in customer_class_priority
//   - Auto priority — sage, rendered when the customer has at least
//     one confirmed booking (and no manual grants)
//   - Standard — grey-cream, rendered when neither applies
//
// What this asserts:
//   - returning-one shows "Manual priority" (has a seeded manual grant
//     on the Wed class)
//   - returning-two shows "Auto priority" (3 confirmed bookings, no
//     manual grants)
//   - A fresh per-run customer with no bookings shows "Standard"
//
// State setup:
//   - returning-one and returning-two are read as-is from the seeded
//     fixture — no modification needed.
//   - The Standard-state test creates a per-run customer via
//     upsert_customer with no bookings and no grants. afterEach cleans
//     it up with deleteCustomerCascade.
//
// The single per-run customer is tracked at describe scope so afterEach
// always cleans up regardless of where the test fails.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('ACL-02 — Priority badges display correctly', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — ACL specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async ({ page }) => {
    createdCustomerId = null;
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async ({ page }) => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
    await signOutAdmin(page).catch(() => { /* already signed out is fine */ });
  });

  test('overall Priority column shows Manual / Auto / Standard badges per client state', async ({ page }) => {
    // --- Set up Standard-state customer: fresh row, no bookings, no grants ---
    const standardEmail = `acl02-${Date.now()}@test.example`;
    const { data: newCustId, error: upsertErr } = await sb.rpc('upsert_customer', {
      p_first_name:    'Stan',
      p_last_name:     'Dard',
      p_email:         standardEmail,
      p_phone:         '07700900800',
      p_customer_type: 'returning',
    });
    expect(upsertErr, `upsert_customer should succeed: ${upsertErr?.message}`).toBeNull();
    expect(newCustId).toBeTruthy();
    createdCustomerId = newCustId;

    // --- Log in and open the Clients tab ---
    await loginAsAdmin(page);
    await page.locator('#dbnav-clients').click();
    await expect(page.locator('#dbnav-clients')).toHaveClass(/on/);

    const tbody = page.locator('#customers-tbody');
    // Wait for the per-run customer's row to appear — confirms render is done
    // without tripping strict-mode on a multi-row locator.
    await expect(
      tbody.locator('tr', { hasText: standardEmail }).first()
    ).toBeVisible({ timeout: 10000 });

    // --- Manual priority: returning-one ---
    // Seeded with a manual grant on the Wed class. Manual wins over auto
    // even though this customer also has 3 confirmed bookings.
    const oneRow = tbody.locator('tr', { hasText: 'returning-one@test.example' }).first();
    await expect(oneRow).toBeVisible();
    const oneBadge = oneRow.locator('td').nth(4).locator('.priority-badge');
    await expect(oneBadge).toBeVisible();
    await expect(oneBadge).toContainText('Manual priority');

    // --- Auto priority: returning-two ---
    // 3 confirmed bookings, no manual grants → auto badge.
    const twoRow = tbody.locator('tr', { hasText: 'returning-two@test.example' }).first();
    await expect(twoRow).toBeVisible();
    const twoBadge = twoRow.locator('td').nth(4).locator('.priority-badge');
    await expect(twoBadge).toBeVisible();
    await expect(twoBadge).toContainText('Auto priority');

    // --- Standard: the fresh per-run customer with no bookings ---
    const standardRow = tbody.locator('tr', { hasText: standardEmail }).first();
    await expect(standardRow).toBeVisible();
    const standardBadge = standardRow.locator('td').nth(4).locator('.priority-badge');
    await expect(standardBadge).toBeVisible();
    await expect(standardBadge).toHaveText('Standard');

    // Sanity: the Standard badge should NOT include the star character
    // that prefixes Manual/Auto badges (&#11088; → ⭐).
    const standardText = (await standardBadge.textContent()).trim();
    expect(standardText).toBe('Standard');
  });
});
