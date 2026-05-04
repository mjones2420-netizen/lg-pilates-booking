// tests/pb-08-manual-priority-allows-early-access.spec.js
//
// PB (Priority Booking) — PB-08: Manually granted priority allows a client
// to access the priority booking window even without having booked the
// previous block.
//
// Excel scenario PB-08: "Manually granted priority allows early access"
//   Given: A client has Manual priority on a class but NOT a confirmed
//          booking on the previous block of that class
//   When:  The next block enters the priority window (8-14 days out)
//          and the client enters their email in the priority gate
//   Then:  - Priority access is GRANTED (where it would otherwise be denied)
//          - "Priority confirmed!" message shown
//          - The booking modal opens with the email pre-filled
//
// Customer / class chosen: returning-two@test.example on Monday class.
//   Original Excel scenario referenced Wednesday, but Wed cards in the
//   current fixture have no active block AND only one upcoming, which
//   means the priority gate UI does NOT render on the Wed card. Monday
//   is the only class with both an active block AND a priority-window
//   upcoming, so the gate UI is only testable there.
//
//   returning-two is confirmed on mon-past and mon-full but NOT on
//   mon-current. The check_priority_access RPC selects mon-current as
//   the "previous block" for mon-upcoming (most-recent end_date <
//   mon-upcoming.start_date), so without a manual grant they are denied.
//   A manual grant on the Monday class flips access from denied to allowed.
//   Verified at session-start with check_priority_access calls in both states.
//
//   See TEST-PLAN.md PB-08 entry and end-of-session Excel update note for
//   the wording change from Wednesday to Monday.
//
// DB access:
//   The customer_class_priority table is admin-only — anon has no grants on
//   it. Fixture writes/reads go via admin-db (direct Postgres). The grant
//   itself in this test is performed through the UI (clicking "Grant" in
//   the per-class panel), and afterEach cleans up via admin-db.
//
// Implementation note (Session 17 fix):
//   The schedule page does NOT re-render when admin signs out — show("schedule")
//   only unhides the existing DOM. So the next-blk panel toggled open in the
//   deny-step at the start of the test is STILL OPEN after sign-out. Don't
//   click the toggle again after sign-out (that would close it). Just refill
//   the email field and re-click the gate button.
//
// Collision check (Session 17 batch):
//   - PB-06 uses returning-two + Fri (separate class).
//   - PB-07 uses returning-one + Wed (separate customer entirely).
//   - PB-09/PB-10 use returning-one + mon-upcoming, NOT returning-two.
//
// Self-cleaning: afterEach removes the manual grant so the fixture is
// restored. The spec deliberately does NOT complete the booking — closing
// the modal after seeing the pre-filled email is enough proof of access.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  loginAsAdmin,
  openClientsTab,
  expandPerClassPanel,
  classPriorityButton,
  signOutAdmin
} = require('./helpers/admin-auth');
const { removeManualPriority } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const TARGET_EMAIL = 'returning-two@test.example';
const TARGET_DAY = 'Monday';

test.describe('PB-08 — Manually granted priority allows early access', () => {
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

    // Pre-flight: clear any leftover manual grant from a failed prior run.
    await removeManualPriority(customerId, classId);

    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Restore fixture: remove the manual grant we created via the UI.
    if (customerId && classId) {
      await removeManualPriority(customerId, classId);
    }
  });

  test('client without a previous-block booking is denied access until admin grants Manual, then allowed', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');

    // Sanity: mon-upcoming must be in the priority window so the gate UI renders.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(monUpcoming.start_date + 'T00:00:00');
    const daysUntil = Math.round((start - today) / (1000 * 60 * 60 * 24));
    expect(daysUntil, 'mon-upcoming must be 8-14 days out for the priority-window UI').toBeGreaterThan(7);
    expect(daysUntil).toBeLessThanOrEqual(14);

    // Step 1: with NO manual grant in place, the priority gate denies access.
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    await card.locator('.next-blk-toggle').click();
    const nextPanel = card.locator('.next-blk-body');
    await expect(nextPanel).toBeVisible();

    await nextPanel.locator(`#pemail-${monUpcoming.id}`).fill(TARGET_EMAIL);
    await nextPanel.locator('button.book-btn', { hasText: 'Check My Priority' }).click();

    const denyMsg = nextPanel.locator(`#pmsg-${monUpcoming.id}`);
    await expect(denyMsg).toBeVisible({ timeout: 5000 });
    await expect(denyMsg, 'baseline: returning-two should be denied without a manual grant')
      .not.toContainText(/Priority confirmed/i);

    // The modal must NOT open in the denied case.
    await expect(page.locator('#overlay.on')).not.toBeVisible();

    // Step 2: admin logs in and grants Manual priority on the Monday class.
    await loginAsAdmin(page);
    await openClientsTab(page);
    await expandPerClassPanel(page, customerId);

    const grantBtn = classPriorityButton(page, customerId, classId, 'grant');
    await expect(grantBtn).toBeVisible();
    await grantBtn.click();
    // Wait for the grant to settle in the DB before signing out.
    await expect(grantBtn).toHaveCount(0, { timeout: 5000 });

    // Step 3: admin signs out, returning the client to the schedule view.
    // NOTE: show("schedule") does NOT re-render the schedule — it just unhides
    // the existing DOM. The next-blk panel from Step 1 is still open and the
    // email field still has its previous value.
    await signOutAdmin(page);

    // Step 4: with the manual grant in place, the same gate now grants access.
    // The panel is already open from Step 1; do NOT click the toggle again or
    // it will close. Just refill the email and re-click the gate button.
    const card2 = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    const nextPanel2 = card2.locator('.next-blk-body');
    await expect(nextPanel2, 'next-blk panel should still be open after sign-out')
      .toBeVisible();

    // Refill (overwrites the prior value cleanly) and re-trigger the gate.
    await nextPanel2.locator(`#pemail-${monUpcoming.id}`).fill(TARGET_EMAIL);
    await nextPanel2.locator('button.book-btn', { hasText: 'Check My Priority' }).click();

    const grantMsg = nextPanel2.locator(`#pmsg-${monUpcoming.id}`);
    await expect(grantMsg).toBeVisible({ timeout: 5000 });
    await expect(grantMsg, 'manual grant should flip access from denied to allowed')
      .toContainText(/Priority confirmed/i);

    // Booking modal opens with email pre-filled — proof the gate accepted.
    await expect(page.locator('#overlay.on')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#b-email')).toHaveValue(TARGET_EMAIL);

    // Deliberately stop here — no actual booking is made. The page is torn
    // down after the test, and afterEach removes the manual grant directly
    // via admin-db.
  });
});
