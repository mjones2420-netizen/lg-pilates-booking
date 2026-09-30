// tests/smoke-01-anon-reads.spec.js
//
// Smoke test: prove the anon role can read public data (classes, blocks, settings)
// as configured by the Session 4/5 audit-compliant RLS and grants.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');

test.describe('Smoke 01 — anon reads', () => {

  test('anon can SELECT from classes and sees the 5 seed classes', async () => {
    const { data, error } = await sb.from('classes').select('id, name, day, venue');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.length).toBe(5);

    const days = data.map(c => c.day).sort();
    expect(days).toEqual(['Friday', 'Monday', 'Thursday', 'Tuesday', 'Wednesday']);
    expect(data.find(c => c.id === 5).name).toBe('Practice – Full Class');
  });

  test('anon can SELECT from blocks and sees 12 seed blocks', async () => {
    const { data, error } = await sb.from('blocks').select('id, class_id, status, cap, booked');

    expect(error).toBeNull();
    expect(data.length).toBe(12);

    // Two blocks should be at capacity: mon-full and the practice full class
    const fullBlocks = data.filter(b => b.booked >= b.cap);
    expect(fullBlocks.length).toBe(2);
    for (const b of fullBlocks) {
      expect(b.cap).toBe(2);
      expect(b.booked).toBe(2);
    }
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
