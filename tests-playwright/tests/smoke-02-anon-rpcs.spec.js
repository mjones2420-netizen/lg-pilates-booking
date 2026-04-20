// tests/smoke-02-anon-rpcs.spec.js
//
// Smoke test: prove the anon role can call the 5 public-facing RPCs and that they
// return the expected results against our seeded fixtures.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');

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
    // returning-one has manual priority on the Wednesday class.
    // Find the upcoming Wed block (days_until_start +3, not the full block).
    const { data: blocks } = await sb
      .from('blocks')
      .select('id, start_date, cap, booked')
      .order('start_date', { ascending: true });

    // First Wednesday upcoming block that isn't the full one
    const wedBlock = blocks.find(b =>
      b.booked < b.cap &&
      new Date(b.start_date) > new Date()
    );
    expect(wedBlock).toBeDefined();

    const { data, error } = await sb.rpc('check_priority_access', {
      p_email: 'returning-one@test.example',
      p_block_id: wedBlock.id
    });

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  test('has_active_booking_on_block returns FALSE for a non-existent booking', async () => {
    // returning-one has NO booking on the Friday locked block (id 6 in seed).
    // Previously this test used the current Mon block, but migration 08 added
    // returning-one as booked on that block to support CB-31 (duplicate-booking
    // detection). The Friday locked block is a stable "no booking" target —
    // far enough in the future to survive date rollovers and clearly unrelated
    // to any other seed setup.
    const { data: ret } = await sb.rpc('lookup_customer', {
      p_email: 'returning-one@test.example'
    });
    const customerId = ret[0].id;

    const { data: allBlocks } = await sb
      .from('blocks')
      .select('id, start_date, class_id')
      .order('start_date', { ascending: true });

    // Pick the Friday upcoming block — furthest in the future among non-full
    // blocks on which returning-one has no booking.
    // We identify it as the block with start_date ~25 days in the future.
    const fridayLocked = allBlocks.find(b => {
      const start = new Date(b.start_date);
      const today = new Date();
      const diffDays = (start - today) / (1000 * 60 * 60 * 24);
      return diffDays > 14 && diffDays < 40;  // locked window
    });
    expect(fridayLocked, 'expected a block ~15-40 days in the future').toBeDefined();

    const { data, error } = await sb.rpc('has_active_booking_on_block', {
      p_customer_id: customerId,
      p_block_id: fridayLocked.id
    });

    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
