// tests/smoke-02-anon-rpcs.spec.js
//
// Smoke test: prove the anon role can call the 5 public-facing RPCs and that they
// return the expected results against our seeded fixtures.
//
// Session 10: switched from hardcoded block IDs and fragile date-window
// heuristics to role-based lookup via getBlockByRole(). Block IDs are
// regenerated on every reseed (migration 09) so role lookup is the only
// stable way to target specific blocks.

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
    // returning-one has NO booking on the fri-upcoming block (seed migration 09
    // only gives them bookings on mon-past, mon-current, and wed-past).
    // This is the stable "no booking" target — role-based lookup means it
    // stays correct across reseeds regardless of date rollovers.
    const { data: ret } = await sb.rpc('lookup_customer', {
      p_email: 'returning-one@test.example'
    });
    const customerId = ret[0].id;

    const friUpcoming = await getBlockByRole('fri-upcoming');

    const { data, error } = await sb.rpc('has_active_booking_on_block', {
      p_customer_id: customerId,
      p_block_id: friUpcoming.id
    });

    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
