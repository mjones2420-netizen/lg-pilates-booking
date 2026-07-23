// st-28-post-payment-outcome-screen.spec.js
//
// ST-28: Post-payment screen verifies the booking actually landed (#6)
//
// A Stripe card payment redirects back with ?payment=success. The booking runs
// asynchronously in stripe-webhook (book_if_available) and can fail (CLASS_FULL
// / ALREADY_BOOKED) if the block filled while the customer was paying. The app
// used to ALWAYS show a "Confirmed" screen. Now it polls
// booking_confirmed_for_session with the checkout session id and only shows the
// green confirmed screen once a confirmed booking exists — otherwise, after a
// short poll window, it shows the honest "payment received but we couldn't
// secure your place" screen.
//
// Requires migration 26 (booking_confirmed_for_session) applied to the test
// project.
//
// Cleanup (afterEach): delete the per-run customer (cascades the booking).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPool, deleteCustomerCascade } = require('./helpers/admin-db');

test.describe('ST-28 — post-payment outcome screen (#6)', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  let custId = null;

  test.afterEach(async () => {
    if (custId) await deleteCustomerCascade(custId);
    custId = null;
  });

  // Creates a confirmed booking on wed-upcoming carrying the given session id.
  async function seedConfirmedBooking(sessionId, suffix) {
    const block = await getBlockByRole('wed-upcoming');
    const { data: id, error: cErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'St28', p_last_name: suffix,
      p_email: `st28-${suffix}-${Date.now()}@test.example`,
      p_phone: '07700900280', p_customer_type: 'new',
    });
    expect(cErr).toBeNull();
    custId = id;
    const { data: bookingId, error: bErr } = await sb.rpc('book_if_available', {
      p_block_id: block.id, p_class_id: block.class_id, p_customer_id: custId, p_amount_due: 60,
    });
    expect(bErr).toBeNull();
    await getPool().query(
      'UPDATE bookings SET status = $1, stripe_checkout_session_id = $2 WHERE id = $3',
      ['confirmed', sessionId, bookingId]);
  }

  test('RPC returns true for a confirmed booking on the session, false otherwise', async () => {
    const okSession = `cs_test_st28_ok_${Date.now()}`;
    await seedConfirmedBooking(okSession, 'rpc');

    const { data: yes, error: e1 } = await sb.rpc('booking_confirmed_for_session', { p_session_id: okSession });
    expect(e1).toBeNull();
    expect(yes).toBe(true);

    const { data: no, error: e2 } = await sb.rpc('booking_confirmed_for_session', { p_session_id: `cs_test_st28_missing_${Date.now()}` });
    expect(e2).toBeNull();
    expect(no).toBe(false);
  });

  test('confirmed booking → green confirmed screen (not the failure screen)', async ({ page }) => {
    const okSession = `cs_test_st28_ui_${Date.now()}`;
    await seedConfirmedBooking(okSession, 'ui');

    await page.goto(APP_PATH + '&payment=success&session_id=' + okSession);
    await expect(page.locator('#stripe-success-overlay')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#stripe-success-overlay')).toContainText('Confirmed');
    await expect(page.locator('#stripe-failed-overlay')).not.toBeVisible();
  });

  test('no booking for the session → amber "could not secure your place" screen', async ({ page }) => {
    test.setTimeout(30000);
    // A session id with no confirmed booking behind it: the poll window elapses
    // and the honest failure screen appears (payment took, place not secured).
    await page.goto(APP_PATH + '&payment=success&session_id=cs_test_st28_none_' + Date.now());
    await expect(page.locator('#stripe-failed-overlay')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#stripe-failed-overlay')).toContainText('secure your place');
    await expect(page.locator('#stripe-success-overlay')).not.toBeVisible();
  });
});
