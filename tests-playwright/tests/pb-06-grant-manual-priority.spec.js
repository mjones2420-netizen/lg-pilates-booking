// tests/pb-06-grant-manual-priority.spec.js
//
// PB (Priority Booking) — PB-06: Admin grants Manual priority on a class
// via the per-class panel in the Clients tab.
//
// Excel scenario PB-06: "Grant manual priority in admin (per-class)"
//   Given: A client has at least one active booking on a class
//   When:  The admin opens the per-class panel and clicks Grant
//   Then:  - The per-class badge changes to green "Manual"
//          - The action button changes from "Grant" to "Remove"
//          - The overall row badge updates to "Manual priority"
//          - A row is inserted into customer_class_priority
//          - The change persists after page reload
//
// Customer / class chosen: returning-two@test.example on Friday class.
//   - returning-two has a confirmed booking on fri-recent-past, so the
//     Friday class appears in their per-class panel with an Auto badge.
//   - No existing manual grant on Friday, so the action button starts as Grant.
//   - Granting Manual flips the badge from Auto → Manual.
//
// DB access:
//   The customer_class_priority table is admin-only — anon has no grants on
//   it (by design). All fixture reads/writes for this table go via the
//   admin-db helper, which opens a direct Postgres connection using
//   TEST_SUPABASE_DB_URL. The shared `sb` client is still used for
//   anon-allowed RPCs (lookup_customer) and reads on `classes`.
//
// Collision check (Session 17 batch):
//   - PB-07 uses returning-one + Wed (separate customer+class).
//   - PB-08 uses returning-two + Mon (different class on same customer — fine,
//     panel rows are scoped by (customer_id, class_id)).
//   - No other suite spec writes to customer_class_priority for this pair.
//
// Self-cleaning: afterEach removes the row from customer_class_priority so
// the fixture is restored regardless of pass/fail.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const {
  loginAsAdmin,
  openClientsTab,
  expandPerClassPanel,
  classPriorityButton,
  classPriorityBadge
} = require('./helpers/admin-auth');
const {
  removeManualPriority,
  hasManualPriority
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const TARGET_EMAIL = 'returning-two@test.example';
const TARGET_DAY = 'Friday';

test.describe('PB-06 — Admin grants Manual priority via per-class panel', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PB specs require the app to be served.');

  let customerId;
  let classId;

  test.beforeEach(async ({ page }) => {
    // Customer lookup goes via the anon RPC (allowed).
    const { data: cust } = await sb.rpc('lookup_customer', { p_email: TARGET_EMAIL });
    expect(cust && cust.length, `fixture: ${TARGET_EMAIL} must exist`).toBe(1);
    customerId = cust[0].id;

    // Classes is anon-readable.
    const { data: cls } = await sb.from('classes').select('id, day').eq('day', TARGET_DAY);
    expect(cls && cls.length, `fixture: a ${TARGET_DAY} class must exist`).toBe(1);
    classId = cls[0].id;

    // Pre-flight: make sure no manual grant already exists for this pair (could
    // be left over from a failed prior run). Uses admin-db (direct pg).
    await removeManualPriority(customerId, classId);

    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Restore fixture: remove any manual grant we created.
    if (customerId && classId) {
      await removeManualPriority(customerId, classId);
    }
  });

  test('grants Manual priority and the UI + DB both reflect the change', async ({ page }) => {
    await loginAsAdmin(page);
    await openClientsTab(page);
    await expandPerClassPanel(page, customerId);

    // Starting state: Grant button visible, Auto badge visible (because of
    // confirmed booking on Friday's recent-past block).
    const grantBtn = classPriorityButton(page, customerId, classId, 'grant');
    const removeBtn = classPriorityButton(page, customerId, classId, 'remove');
    const badge = classPriorityBadge(page, customerId, classId);

    await expect(grantBtn, 'Grant button should be visible before granting').toBeVisible();
    await expect(removeBtn).toHaveCount(0);
    await expect(badge).toContainText(/Auto/i);

    // Click Grant.
    await grantBtn.click();

    // Wait for the table to re-render — toggleClassPriority calls
    // renderCustomersTab() after the insert. Panels collapse on re-render,
    // so re-expand to verify the new state.
    await expect(grantBtn).toHaveCount(0, { timeout: 5000 });
    await expandPerClassPanel(page, customerId);

    // After: Remove button visible, Manual badge visible.
    const newRemoveBtn = classPriorityButton(page, customerId, classId, 'remove');
    const newBadge = classPriorityBadge(page, customerId, classId);
    await expect(newRemoveBtn, 'Remove button should be visible after granting').toBeVisible();
    await expect(newBadge).toContainText(/Manual/i);

    // Overall row badge should now show "Manual priority".
    const rowBadge = page.locator(`#cust-row-${customerId} .priority-badge`);
    await expect(rowBadge).toContainText(/Manual priority/i);

    // DB-level verification: row exists in customer_class_priority (via direct pg).
    expect(await hasManualPriority(customerId, classId),
      'customer_class_priority row should exist').toBe(true);

    // Persistence check: reload, log in again, verify the grant survived.
    await page.reload();
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
    await openClientsTab(page);
    await expandPerClassPanel(page, customerId);
    await expect(classPriorityButton(page, customerId, classId, 'remove')).toBeVisible();
    await expect(classPriorityBadge(page, customerId, classId)).toContainText(/Manual/i);
  });
});
