// tests/smoke-01-anon-reads.spec.js
//
// Smoke test: prove the anon role can read public data (classes, blocks, settings)
// as configured by the Session 4/5 audit-compliant RLS and grants.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');

test.describe('Smoke 01 — anon reads', () => {

  test('anon can SELECT from classes and sees the 4 seed classes', async () => {
    const { data, error } = await sb.from('classes').select('id, name, day, venue');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.length).toBe(4);

    const days = data.map(c => c.day).sort();
    expect(days).toEqual(['Friday', 'Monday', 'Thursday', 'Wednesday']);
  });

  test('anon can SELECT from blocks and sees 11 seed blocks', async () => {
    const { data, error } = await sb.from('blocks').select('id, class_id, status, cap, booked');

    expect(error).toBeNull();
    expect(data.length).toBe(11);

    // One block should be at capacity (the "full" fixture)
    const fullBlocks = data.filter(b => b.booked >= b.cap);
    expect(fullBlocks.length).toBe(1);
    expect(fullBlocks[0].cap).toBe(2);
    expect(fullBlocks[0].booked).toBe(2);
  });

  test('anon can SELECT from settings and sees bank details (but NOT admin_email)', async () => {
    const { data, error } = await sb.from('settings').select('key, value');

    expect(error).toBeNull();
    const keys = data.map(s => s.key).sort();
    // admin_email is now hidden from anon by row-level RLS (#38, migration 24) —
    // the public booking screen only needs the bank + payment keys.
    expect(keys).toEqual(['bank_account_no', 'bank_name', 'bank_sort_code', 'payment_mode', 'stripe_publishable_key']);
    expect(keys, 'admin_email must not be readable by anon').not.toContain('admin_email');
  });
});
