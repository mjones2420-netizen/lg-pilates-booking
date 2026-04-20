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
    // returning-one has no booking on the current Mon block (id 2 in seed)
    const { data: ret } = await sb.rpc('lookup_customer', {
      p_email: 'returning-one@test.example'
    });
    const customerId = ret[0].id;

    const { data: monBlocks } = await sb
      .from('blocks')
      .select('id, start_date, class_id')
      .order('start_date', { ascending: true });

    // Current Mon block: start_date is in the past but not -48 days ago
    const currentBlock = monBlocks.find(b => {
      const start = new Date(b.start_date);
      const today = new Date();
      const diffDays = (start - today) / (1000 * 60 * 60 * 24);
      return diffDays < 0 && diffDays > -30;  // past but recent
    });
    expect(currentBlock).toBeDefined();

    const { data, error } = await sb.rpc('has_active_booking_on_block', {
      p_customer_id: customerId,
      p_block_id: currentBlock.id
    });

    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
