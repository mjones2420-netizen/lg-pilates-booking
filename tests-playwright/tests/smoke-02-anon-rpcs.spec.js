// tests/smoke-02-anon-rpcs.spec.js
//
// Smoke test: prove the anon role can call the 5 public-facing RPCs and that they
// return the expected results against our seeded fixtures.
//
// Session 10: switched from hardcoded block IDs and fragile date-window
// heuristics to role-based lookup via getBlockByRole(). Block IDs are
// regenerated on every reseed (migration 09) so role lookup is the only
// stable way to target specific blocks.
//
// Session 15: the has_active_booking_on_block FALSE-case test was previously
// asserting that returning-one had no booking on fri-upcoming. CB-32 (added
// in Batch 5) deliberately books returning-one onto fri-upcoming, so that
// pair is no longer a stable "no booking" target after CB-32 has run.
// Switched to deliberately-fake IDs (999_999_999) which can never match a
// real booking — this also better reflects the test's intent (proving the
// RPC contract returns false for non-existent records, independent of any
// fixture state).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');

test.describe('Smoke 02 — anon RPCs', () => {

  test('lookup_customer returns a known seed customer', async () => {
    const { data, error } = await sb.rpc('lookup_customer', {
      p_email: 'returning-one@test.example'
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.length).toBe(1);
    expect(data[0].first_name).toBe('Returning');
    expect(data[0].last_name).toBe('One');
    expect(data[0].customer_type).toBe('returning');
  });

  test('lookup_customer returns empty for unknown email', async () => {
    const { data, error } = await sb.rpc('lookup_customer', {
      p_email: 'nobody@test.example'
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('check_priority_access returns TRUE for manual priority grant', async () => {
    // returning-one has a manual priority grant on the Wednesday class
    // (customer_class_priority row seeded by migration 09). The wed-upcoming
    // block is the only block on that class in the upcoming state, so it's
    // the correct target for verifying the manual-priority path.
    const wedUpcoming = await getBlockByRole('wed-upcoming');

    const { data, error } = await sb.rpc('check_priority_access', {
      p_email: 'returning-one@test.example',
      p_block_id: wedUpcoming.id
    });

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  test('has_active_booking_on_block returns FALSE for a non-existent booking', async () => {
    // Use deliberately-fake IDs that can never match a real booking row.
    // This proves the RPC contract (returns false when no row exists) without
    // depending on any specific (customer, block) pair staying unbooked —
    // which would be a flaky guarantee, since CB specs deliberately create
    // bookings as part of their assertions (e.g. CB-32 books returning-one
    // onto fri-upcoming, which used to be the "stable no-booking" pair here).
    const FAKE_CUSTOMER_ID = 999999999;
    const FAKE_BLOCK_ID    = 999999999;

    const { data, error } = await sb.rpc('has_active_booking_on_block', {
      p_customer_id: FAKE_CUSTOMER_ID,
      p_block_id:    FAKE_BLOCK_ID
    });

    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
