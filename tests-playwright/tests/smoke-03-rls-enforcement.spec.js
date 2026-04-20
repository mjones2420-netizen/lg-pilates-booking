// tests/smoke-03-rls-enforcement.spec.js
//
// Smoke test: prove anon cannot bypass the defence-in-depth and read protected tables.
// This is the Session 4 + Session 5 hardening working end-to-end:
//   - RLS policy (Session 4): no anon SELECT policy on bookings/customers
//   - Grants (Session 5): anon has no SELECT privilege on those tables anyway
//
// If EITHER layer returns data, the test fails and we've regressed.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');

test.describe('Smoke 03 — RLS / grants enforcement', () => {

  test('anon cannot SELECT from bookings', async () => {
    const { data, error } = await sb.from('bookings').select('*');

    // Two acceptable outcomes from the supabase-js client when access is denied:
    //  - error set (e.g. permission denied)
    //  - data returned but empty (RLS silently filters)
    // Either way, anon must not see the 4 seeded bookings.
    if (data) {
      expect(data.length).toBe(0);
    }
  });

  test('anon cannot SELECT from customers', async () => {
    const { data, error } = await sb.from('customers').select('*');

    if (data) {
      expect(data.length).toBe(0);
    }
  });

  test('anon cannot SELECT from cancellations', async () => {
    const { data, error } = await sb.from('cancellations').select('*');

    if (data) {
      expect(data.length).toBe(0);
    }
  });

  test('anon cannot INSERT into bookings directly (grant blocks write)', async () => {
    // The only path to create bookings is via book_if_available RPC.
    // Direct INSERT should be refused.
    const { data, error } = await sb
      .from('bookings')
      .insert({ class_id: 1, block_id: 1, customer_id: 1, status: 'reserved' })
      .select();

    // We expect an error, OR at minimum that no row came back
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error).toBeDefined();
    }
  });
});
