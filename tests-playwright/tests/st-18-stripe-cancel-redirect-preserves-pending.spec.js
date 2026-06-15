// ST-18 — Cancel redirect leaves pending_bookings row intact, shows toast
//
// What this proves:
//   When the app loads with ?payment=cancelled in the URL (Stripe's cancel_url
//   redirect), handleStripeRedirect() shows the toast "Payment was not
//   completed — you can try again." and does NOT touch pending_bookings —
//   the row created by the earlier stripe-checkout call is left as-is to
//   expire naturally after 2 hours.
//
// Approach:
//   A pending_bookings row is inserted directly via pg (simulating a checkout
//   that was started but cancelled before completion). The app is then loaded
//   with &payment=cancelled appended to APP_PATH. The toast text is checked
//   via #toastEl's textContent (not its 'on' class, which the app removes
//   after 3 seconds — checking textContent avoids a timing race). The pending
//   row is re-fetched by id and compared field-for-field to the original.
//
// Cleanup:
//   afterEach deletes the pending_bookings row by id.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById
} = require('./helpers/admin-db');

const TEST_EMAIL = `st18-${Date.now()}@test.example`;

test.describe('ST-18 — Cancel redirect leaves pending_bookings row intact', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  let pendingId = null;

  test.beforeEach(async () => {
    const blk = await getBlockByRole('fri-upcoming');
    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Stripe',
      lastName: 'Cancelled',
      email: TEST_EMAIL,
      phone: '07700900118',
      customerType: 'new',
      amountPence: 6000
    });
  });

  test.afterEach(async () => {
    if (pendingId) {
      await deletePendingBookingById(pendingId);
      pendingId = null;
    }
  });

  test('shows cancellation toast and leaves the pending_bookings row untouched', async ({ page }) => {
    const before = await getPendingBookingById(pendingId);
    expect(before).not.toBeNull();

    const cancelUrl = APP_PATH + '&payment=cancelled';
    await page.goto(cancelUrl);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    // Toast textContent is set synchronously and never cleared (only the
    // 'on' class is removed after 3s), so this is timing-safe.
    await expect(page.locator('#toastEl')).toHaveText('Payment was not completed — you can try again.');

    // The pending row must be completely untouched.
    const after = await getPendingBookingById(pendingId);
    expect(after).not.toBeNull();
    expect(after.class_id).toBe(before.class_id);
    expect(after.block_id).toBe(before.block_id);
    expect(after.email).toBe(before.email);
    expect(after.first_name).toBe(before.first_name);
    expect(after.last_name).toBe(before.last_name);
    expect(after.customer_type).toBe(before.customer_type);
    expect(after.amount_pence).toBe(before.amount_pence);
    expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
  });
});
