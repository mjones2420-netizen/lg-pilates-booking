// tests/pb-07-remove-manual-priority.spec.js
//
// PB (Priority Booking) — PB-07: Admin removes Manual priority on a class
// via the per-class panel in the Clients tab.
//
// Excel scenario PB-07: "Remove manual priority in admin (per-class)"
//   Given: A client has Manual priority on a class (and a confirmed booking
//          on a previous block of that class, so Auto would still apply)
//   When:  The admin opens the per-class panel and clicks Remove
//   Then:  - The per-class badge reverts from Manual to Auto
//          - The action button reverts from Remove to Grant
//          - The overall row badge updates to Auto priority (or Standard if
//            no other grants exist for this client)
//          - The row is deleted from customer_class_priority
//
// Customer / class chosen: returning-one@test.example on Wednesday class.
//   - The fixture seeds a Manual grant for this exact pair (migration 09).
//   - returning-one is also confirmed on wed-past, so removing the Manual
//     grant should leave them with Auto priority (badge: "Auto"), exercising
//     the Manual → Auto fall-through path.
//
// DB access:
//   The customer_class_priority table is admin-only — anon has no grants on
//   it (by design). All fixture reads/writes for this table go via the
//   admin-db helper, which opens a direct Postgres connection using
//   TEST_SUPABASE_DB_URL.
//
// Collision check (Session 17 batch):
//   - PB-06 uses returning-two + Fri (separate customer+class).
//   - PB-08 uses returning-two + Mon (separate customer entirely).
//   - smoke-02 references returning-one's manual priority on Wed by asserting
//     check_priority_access returns true. PB-07 deletes that row in the test
//     body but RESTORES it in afterEach so smoke-02's invariant is preserved
//     between specs.
//
// Self-cleaning: afterEach re-inserts the manual grant if we deleted it,
// restoring the fixture state expected by smoke-02 and any future runs.

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
  grantManualPriority,
  hasManualPriority
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const TARGET_EMAIL = 'returning-one@test.example';
const TARGET_DAY = 'Wednesday';

test.describe('PB-07 — Admin removes Manual priority via per-class panel', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PB specs require the app to be served.');

  let customerId;
  let classId;

  test.beforeEach(async ({ page }) => {
    const { data: cust } = await sb.rpc('lookup_customer', { p_email: TARGET_EMAIL });
    expect(cust && cust.length, `fixture: ${TARGET_EMAIL} must exist`).toBe(1);
    customerId = cust[0].id;

    const { data: cls } = await sb.from('classes').select('id, day').eq('day', TARGET_DAY);
    expect(cls && cls.length, `fixture: a ${TARGET_DAY} class must exist`).toBe(1);
    classId = cls[0].id;

    // Pre-flight: confirm the seed grant is in place. If a previous failure
    // left the fixture without it, re-insert via direct pg.
    if (!(await hasManualPriority(customerId, classId))) {
      await grantManualPriority(customerId, classId);
    }

    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Fixture restore: ensure the seed grant is back in place.
    if (customerId && classId) {
      if (!(await hasManualPriority(customerId, classId))) {
        await grantManualPriority(customerId, classId);
      }
    }
  });

  test('removes Manual priority and the UI + DB both reflect the change', async ({ page }) => {
    await loginAsAdmin(page);
    await openClientsTab(page);
    await expandPerClassPanel(page, customerId);

    // Starting state: Remove button visible, Manual badge visible.
    const removeBtn = classPriorityButton(page, customerId, classId, 'remove');
    const grantBtn = classPriorityButton(page, customerId, classId, 'grant');
    const badge = classPriorityBadge(page, customerId, classId);

    await expect(removeBtn, 'Remove button should be visible before removing').toBeVisible();
    await expect(grantBtn).toHaveCount(0);
    await expect(badge).toContainText(/Manual/i);

    // Click Remove.
    await removeBtn.click();

    // Wait for the table to re-render — panels collapse, so re-expand.
    await expect(removeBtn).toHaveCount(0, { timeout: 5000 });
    await expandPerClassPanel(page, customerId);

    // After: Grant button visible, Auto badge (because of confirmed booking
    // on wed-past).
    const newGrantBtn = classPriorityButton(page, customerId, classId, 'grant');
    const newBadge = classPriorityBadge(page, customerId, classId);
    await expect(newGrantBtn, 'Grant button should be visible after removing').toBeVisible();
    await expect(newBadge).toContainText(/Auto/i);

    // DB-level verification: the row no longer exists (via direct pg).
    expect(await hasManualPriority(customerId, classId),
      'customer_class_priority row should be gone').toBe(false);
  });
});
