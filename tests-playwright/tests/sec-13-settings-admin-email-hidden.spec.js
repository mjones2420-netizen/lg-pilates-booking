// SEC-13 — settings.admin_email is hidden from the anon role (#38)
//
// The settings table's anon SELECT policy used to be USING(true), so anyone
// with the public anon key could read EVERY row including admin_email
// (harvestable for targeted spam/phishing). Migration 24 makes the anon read
// row-level: the public keys the booking screen genuinely needs (bank details,
// payment_mode, stripe_publishable_key) stay readable, while admin_email is
// restricted to a logged-in admin (is_admin(), from migration 20).
//
// Pure-DB spec at the exact trust boundary an attacker would use:
//   1. anon client (shared sb): SELECT settings returns the public keys but
//      NOT admin_email.
//   2. authenticated admin client: SELECT settings DOES return admin_email.
//
// Requires migration 24 applied to the test project. No rows are created, so
// no cleanup is needed. A dedicated one-off admin client is used for test 2 so
// signing in never mutates the shared anon `sb` auth state other specs rely on.

const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { sb } = require('./helpers/supabase');

const URL      = process.env.TEST_SUPABASE_URL;
const ANON     = process.env.TEST_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PW    = process.env.TEST_ADMIN_PASSWORD;

test.describe('SEC-13 — settings.admin_email hidden from anon (#38)', () => {
  test.skip(!URL, 'TEST_SUPABASE_URL not set');

  test('anon SELECT on settings excludes admin_email but keeps the public keys', async () => {
    const { data, error } = await sb.from('settings').select('key,value');
    expect(error, 'anon SELECT on settings should not error').toBeNull();
    expect(data, 'anon SELECT should return the public rows').toBeTruthy();

    const keys = data.map(r => r.key);
    // The leak #38 closes: admin_email must NOT be returned to anon.
    expect(keys, 'admin_email must not be visible to anon').not.toContain('admin_email');
    // The public booking screen still needs the bank details.
    for (const k of ['bank_name', 'bank_sort_code', 'bank_account_no']) {
      expect(keys, `anon should still see ${k}`).toContain(k);
    }
  });

  test('an authenticated admin CAN read admin_email', async () => {
    test.skip(!ANON || !ADMIN_EMAIL || !ADMIN_PW,
      'TEST_SUPABASE_ANON_KEY / TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set');

    const admin = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await admin.auth.signInWithPassword({
      email: ADMIN_EMAIL, password: ADMIN_PW,
    });
    expect(signInErr, 'admin sign-in should succeed').toBeNull();

    const { data, error } = await admin.from('settings').select('key,value');
    expect(error, 'admin SELECT on settings should not error').toBeNull();
    const keys = (data || []).map(r => r.key);
    expect(keys, 'a logged-in admin must be able to read admin_email').toContain('admin_email');

    await admin.auth.signOut();
  });
});
