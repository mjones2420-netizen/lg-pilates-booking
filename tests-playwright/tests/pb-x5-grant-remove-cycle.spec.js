// PB-X5 — Manual priority grant/remove cycle via admin panel
//
// What this proves: A full round-trip through the admin panel — granting
// manual priority unlocks the gate for a client, and removing it locks them
// back out. End-to-end UI test driving both the admin Clients tab and the
// client-facing gate. Confirms the admin grant/remove buttons produce the
// same effect as the seed-time priority grant.
//
// Customer: returning-two@test.example — confirmed on mon-past and mon-full,
// NOT on mon-current. Without a manual grant, the priority RPC denies them
// on mon-upcoming (mon-current is the actual previous block per the RPC's
// logic). Same setup as PB-08 — extending it with a remove step.
//
// Phases:
//   1. Baseline: gate denies returning-two on mon-upcoming
//   2. Admin logs in, opens Clients, expands returning-two's per-class panel,
//      clicks Grant on Monday
//   3. Admin signs out
//   4. Gate now allows access (Priority confirmed message + modal opens)
//   5. Close modal, admin logs in again, clicks Remove on the Monday class
//   6. Admin signs out
//   7. Gate denies access again
//
// afterEach removes any leftover grant via direct pg (belt-and-braces in case
// of mid-test failure).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const {
  loginAsAdmin, signOutAdmin,
  openClientsTab,
  expandPerClassPanel, classPriorityButton
} = require('./helpers/admin-auth');
const { removeManualPriority } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const ELIGIBLE_EMAIL = 'returning-two@test.example';
const MON_CLASS_ID = 1;

test.describe('PB-X5 — Manual priority grant/remove cycle via admin panel', () => {

  let returningTwoId = null;

  test.beforeEach(async ({ page }) => {
    // Resolve returning-two's customer id once for cleanup use
    const { data: lookup } = await sb.rpc('lookup_customer', { p_email: ELIGIBLE_EMAIL });
    returningTwoId = (lookup && lookup.length) ? lookup[0].id : null;
    expect(returningTwoId).toBeTruthy();

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test.afterEach(async () => {
    // Belt-and-braces cleanup — ensure no stray grant survives this test
    if (returningTwoId) {
      await removeManualPriority(returningTwoId, MON_CLASS_ID);
    }
  });

  test('grant unlocks gate, remove locks it again', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');

    // -------- Phase 1: Baseline — gate denies returning-two --------
    const toggle = page.locator(`[onclick="toggleNextBlk('nb-${monUpcoming.id}')"]`);
    await expect(toggle).toBeVisible();
    await toggle.click();

    const emailInput = page.locator(`#pemail-${monUpcoming.id}`);
    await expect(emailInput).toBeVisible();
    await emailInput.fill(ELIGIBLE_EMAIL);

    const checkBtn = page.locator(`#pcheck-${monUpcoming.id} button`, { hasText: /check my priority/i });
    await checkBtn.click();

    const msg = page.locator(`#pmsg-${monUpcoming.id}`);
    await expect(msg).toContainText(/don't have priority booking/i);
    await expect(page.locator('#overlay.on')).toHaveCount(0);

    // -------- Phase 2: Admin grants Manual on Monday --------
    await loginAsAdmin(page);
    await openClientsTab(page);
    await expandPerClassPanel(page, returningTwoId);

    const grantBtn = classPriorityButton(page, returningTwoId, MON_CLASS_ID, 'grant');
    await grantBtn.click();

    // toggleClassPriority is fire-and-forget: an async IIFE awaits the DB write,
    // shows the toast, then calls renderCustomersTab() (also async). Until that
    // chain completes, the DOM may still hold the OLD panel (with the Grant
    // button), and clicking Per-class can race against the re-render that
    // replaces it. Wait for the toast (DB write done) AND for the new Remove
    // button to appear in the DOM (re-render done) before doing anything else.
    await expect(page.locator('#toastEl.on')).toBeVisible();
    await expect(
      classPriorityButton(page, returningTwoId, MON_CLASS_ID, 'remove')
    ).toHaveCount(1);

    // Panel is collapsed again after re-render — re-expand and assert.
    await expandPerClassPanel(page, returningTwoId);
    await expect(
      classPriorityButton(page, returningTwoId, MON_CLASS_ID, 'remove')
    ).toBeVisible();

    // -------- Phase 3: Admin signs out --------
    await signOutAdmin(page);

    // Schedule view does NOT re-render on sign-out. The next-blk panel from
    // Phase 1 is still open. (See PB-08 implementation note in TEST-PLAN.md.)
    // Re-fill the email and re-trigger the gate.
    await expect(emailInput).toBeVisible();
    await emailInput.fill(ELIGIBLE_EMAIL);
    await checkBtn.click();

    // -------- Phase 4: Gate now allows access --------
    await expect(msg).toContainText(/priority confirmed/i);
    await expect(page.locator('#overlay.on')).toBeVisible();
    await expect(page.locator('#b-email')).toHaveValue(ELIGIBLE_EMAIL);

    // -------- Phase 5: Close modal, admin removes the grant --------
    const closeBtn = page.locator('#overlay .mclose').first();
    await closeBtn.click();
    await expect(page.locator('#overlay.on')).toHaveCount(0);

    // The dashboard tab classes are sticky across sign-out (the static markup
    // sets tab-bookings.on as default, but switchTab moves .on to whichever
    // tab was clicked, and signOut doesn't reset it). loginAsAdmin's helper
    // expects #tab-bookings.on after re-login, so reload to a clean state
    // before the second login. Session was cleared by signOutAdmin, so this
    // takes us back to the login form rather than skipping it.
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();

    await loginAsAdmin(page);
    await openClientsTab(page);
    await expandPerClassPanel(page, returningTwoId);

    const removeBtn = classPriorityButton(page, returningTwoId, MON_CLASS_ID, 'remove');
    await removeBtn.click();

    // Same async race as the Grant click — wait for toast + re-rendered Grant
    // button to appear before re-expanding.
    await expect(page.locator('#toastEl.on')).toBeVisible();
    await expect(
      classPriorityButton(page, returningTwoId, MON_CLASS_ID, 'grant')
    ).toHaveCount(1);

    await expandPerClassPanel(page, returningTwoId);
    await expect(
      classPriorityButton(page, returningTwoId, MON_CLASS_ID, 'grant')
    ).toBeVisible();

    // -------- Phase 6: Admin signs out --------
    await signOutAdmin(page);

    // -------- Phase 7: Gate denies access again --------
    // The page was reloaded in Phase 5 to reset dashboard tab state, so the
    // priority panel from Phase 1 is no longer open. Re-open it before
    // re-running the gate denial assertion.
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(emailInput).toBeVisible();
    await emailInput.fill(ELIGIBLE_EMAIL);
    await checkBtn.click();

    await expect(msg).toContainText(/don't have priority booking/i);
    await expect(page.locator('#overlay.on')).toHaveCount(0);
  });
});
