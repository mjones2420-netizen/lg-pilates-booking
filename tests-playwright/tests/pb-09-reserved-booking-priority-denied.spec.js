// tests/pb-09-reserved-booking-priority-denied.spec.js
//
// PB (Priority Booking) — PB-09: Reserved booking does NOT grant priority access.
//
// Excel scenario PB-09: "Reserved booking does NOT grant priority access"
//   Given: A client has a Reserved (not Confirmed) booking on the current block
//   When:  The next block is in the priority window (8-14 days away)
//          and the client enters their email in the priority gate
//   Then:  - Priority access is DENIED
//          - Client sees the standard booking message ("Standard booking opens on...")
//          - They cannot proceed past the gate
//
// Why this matters: only 'confirmed' bookings on the previous block grant
// priority. 'reserved' (still awaiting payment) does not. This protects
// Louise from priority access being granted to clients who haven't actually
// paid for their previous block.
//
// Fixture role used: mon-upcoming
//   The check_priority_access RPC selects the previous block as the most-
//   recent end_date < the upcoming block's start_date. For mon-upcoming this
//   is mon-current (active block). We create a fresh customer with a
//   reserved booking on mon-current, then assert priority is denied for
//   mon-upcoming.
//
// Spec self-contained: creates its own customer + reserved booking via the
// public RPCs (upsert_customer, book_if_available). book_if_available always
// inserts as status='reserved' — exactly what PB-09 needs.
//
// Self-cleaning (Session 19, Batch 6): afterEach calls deleteCustomerCascade
// on the fresh customer this test creates, removing both the customer row
// and the reserved booking on mon-current. Each test uses a unique
// timestamped email, so cleanup is scoped to per-run state only.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole, getBlocksByRoles } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('PB-09 — Reserved booking on previous block: priority denied', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PB specs require the app to be served.');

  // Per-run customer ID tracked at describe scope so afterEach can clean up
  // regardless of where the test fails. Set immediately after upsert_customer
  // succeeds inside the test body.
  let createdCustomerId = null;

  test.beforeEach(async ({ page }) => {
    createdCustomerId = null;
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('client with only a reserved booking on the previous block is denied priority access', async ({ page }) => {
    const blocks = await getBlocksByRoles(['mon-current', 'mon-upcoming']);
    const monCurrent  = blocks['mon-current'];
    const monUpcoming = blocks['mon-upcoming'];

    // Sanity: mon-upcoming must be in the priority window for the gate to render.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(monUpcoming.start_date + 'T00:00:00');
    const daysUntil = Math.round((start - today) / (1000 * 60 * 60 * 24));
    expect(daysUntil, 'mon-upcoming must be 8-14 days out for the priority-window UI').toBeGreaterThan(7);
    expect(daysUntil).toBeLessThanOrEqual(14);

    // Create a fresh customer for this spec.
    const email = `pb09-${Date.now()}@test.example`;
    const { data: customerId, error: upsertErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Reserved',
      p_last_name:  'Tester',
      p_email:      email,
      p_phone:      '07700900909',
      p_customer_type: 'returning'
    });
    expect(upsertErr, 'upsert_customer must not error').toBeFalsy();
    expect(customerId, 'upsert_customer must return a customer id').toBeTruthy();
    createdCustomerId = customerId;  // expose to afterEach for cleanup

    // Create a reserved booking on the previous block (mon-current).
    // book_if_available always inserts as status='reserved' — exactly what we need.
    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    monCurrent.id,
      p_class_id:    monCurrent.class_id,
      p_customer_id: customerId,
      p_amount_due:  0
    });
    expect(bookErr, 'book_if_available must succeed for the test setup').toBeFalsy();
    expect(bookingId, 'a booking row must be created on mon-current').toBeTruthy();

    // Reload so the page sees the new state if it ever cached.
    await page.goto(APP_PATH);

    // Open the Monday card's next-block toggle and enter the email in the gate.
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    await card.locator('.next-blk-toggle').click();
    const nextPanel = card.locator('.next-blk-body');
    await expect(nextPanel).toBeVisible();

    await nextPanel.locator(`#pemail-${monUpcoming.id}`).fill(email);
    await nextPanel.locator('button.book-btn', { hasText: 'Check My Priority' }).click();

    // Deny message renders. Reserved booking on previous block must NOT grant priority.
    const denyMsg = nextPanel.locator(`#pmsg-${monUpcoming.id}`);
    await expect(denyMsg).toBeVisible({ timeout: 5000 });
    await expect(denyMsg).toContainText(/don't have priority booking/i);
    await expect(denyMsg).toContainText(/Standard booking opens/i);

    // Negative check — booking modal must NOT have opened.
    await expect(page.locator('#overlay.on')).not.toBeVisible();
  });
});
