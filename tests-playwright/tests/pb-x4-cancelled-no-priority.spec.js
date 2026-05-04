// PB-X4 — Cancelled previous-block booking does not grant priority
//
// What this proves: A `cancelled` booking on the previous block does NOT count
// as a priority-eligible booking. The check_priority_access RPC only treats
// `confirmed` as eligible. PB-09 is the matching test for `reserved`; PB-X4
// covers `cancelled`. Together they prove the RPC's status filter is strict.
//
// Approach (mirrors PB-09):
//   - Create a fresh customer
//   - Create a booking on mon-current via book_if_available (RPC inserts as reserved)
//   - Update that booking's status to `cancelled` via direct pg
//   - Resync the blocks.booked count (trigger only fires on app-level inserts/deletes)
//   - Reload page so the gate sees the new state
//   - Submit the customer's email to the priority gate on Monday
//   - Assert denial UI

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const { setBookingStatus, resyncBlockBookedCount, deleteCustomerCascade } = require('./helpers/admin-db');
const { getBlocksByRoles } = require('./helpers/fixture-lookup');

test.describe('PB-X4 — Cancelled previous-block booking: priority denied', () => {

  // Track per-run customer ID so afterEach can clean up regardless of where
  // the test fails. PB-X4 creates a fresh customer + booking on mon-current
  // (then flips it to cancelled). Without cleanup these accumulate and
  // eventually fill the block — see Session 18 mon-current cleanup notes.
  let createdCustomerId = null;

  test.beforeEach(async ({ page }) => {
    createdCustomerId = null;
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('cancelled status on previous block does not unlock priority', async ({ page }) => {
    const ts = Date.now();
    const email = `pbx4-${ts}@test.example`;

    const { 'mon-current': monCurrent, 'mon-upcoming': monUpcoming } =
      await getBlocksByRoles(['mon-current', 'mon-upcoming']);
    expect(monCurrent).toBeTruthy();
    expect(monUpcoming).toBeTruthy();

    // Create the customer
    const { data: customerId, error: upsertErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'PBX4',
      p_last_name: 'Cancelled',
      p_email: email,
      p_phone: '07000000000',
      p_customer_type: 'returning'
    });
    expect(upsertErr).toBeNull();
    expect(customerId).toBeTruthy();
    createdCustomerId = customerId;  // expose to afterEach for cleanup

    // Create a booking on mon-current — book_if_available inserts as 'reserved'
    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id: monCurrent.id,
      p_class_id: monCurrent.class_id,
      p_customer_id: customerId,
      p_amount_due: 0
    });
    expect(bookErr).toBeNull();
    expect(bookingId).toBeTruthy();

    // Flip status to 'cancelled' via direct pg (anon has no UPDATE on bookings)
    await setBookingStatus(bookingId, 'cancelled');
    // Resync blocks.booked — a status change isn't an INSERT/DELETE so the
    // trigger doesn't fire. Belt-and-braces here.
    await resyncBlockBookedCount(monCurrent.id);

    // Reload so the priority gate sees the new state
    await page.reload();
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();

    // Open the Monday priority gate via its unique toggle attribute
    const toggle = page.locator(`[onclick="toggleNextBlk('nb-${monUpcoming.id}')"]`);
    await expect(toggle).toBeVisible();
    await toggle.click();

    const emailInput = page.locator(`#pemail-${monUpcoming.id}`);
    await expect(emailInput).toBeVisible();
    await emailInput.fill(email);

    const checkBtn = page.locator(`#pcheck-${monUpcoming.id} button`, { hasText: /check my priority/i });
    await checkBtn.click();

    // Deny message
    const msg = page.locator(`#pmsg-${monUpcoming.id}`);
    await expect(msg).toBeVisible();
    await expect(msg).toContainText(/don't have priority booking/i);
    await expect(msg).toContainText(/standard booking opens/i);

    // Modal must NOT open
    await expect(page.locator('#overlay.on')).toHaveCount(0);
  });
});
