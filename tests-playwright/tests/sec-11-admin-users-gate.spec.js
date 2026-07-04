// tests/sec-11-admin-users-gate.spec.js
//
// SEC-11: Real admin gate in the database (#55)
//
// Security framing:
//   Before migration 20, every admin RLS policy read "TO authenticated
//   USING (true)" — any account that could log in got full admin access
//   (all customer/booking/health data, settings, the lot). #43 is meant to
//   close public signup at the Auth level, but #55 adds the belt to that
//   braces at the DB level: only accounts listed in admin_users get
//   anything, no matter how the account came to exist.
//
//   This spec creates a brand new, ordinary authenticated user (NOT present
//   in admin_users) and proves the database itself refuses it everywhere
//   an admin-only policy applies — reads return zero rows, writes affect
//   zero rows, and the admin-only cascade-delete RPCs (#56) reject it
//   outright. This is the exact attack #55 defends against, so we exercise
//   it for real rather than mocking is_admin().
//
// Why via direct pg rather than client.auth.signUp: this project's Auth
// config rejects signup email addresses that don't look like real mail
// domains (both "@test.example" and "@example.com" were refused as
// "invalid" during development of this spec), so a throwaway signup can't
// be relied on here. Instead we insert the auth.users row directly with
// pgcrypto's bcrypt (matching GoTrue's own hashing) and sign in normally —
// this is what actually matters for #55: a real authenticated session that
// is NOT in admin_users. Setup/cleanup use the same admin-db.js connection
// as fixture management elsewhere, which already refuses to run against
// production.

const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { getPool } = require('./helpers/admin-db');

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;

test.describe('SEC-11 — admin_users gate rejects non-admin authenticated users', () => {
  test.skip(!url || !anonKey, 'TEST_SUPABASE_URL/TEST_SUPABASE_ANON_KEY not set — SEC specs require .env.test populated.');

  let userId = null;

  test.afterEach(async () => {
    if (userId) {
      await getPool().query('DELETE FROM auth.users WHERE id = $1', [userId]);
      userId = null;
    }
  });

  test('SEC-11 — non-admin authenticated user gets zero rows / rejected writes', async () => {
    const userEmail = `sec11-${Date.now()}@test.example`;
    const password = `Sec11Pw!${Date.now()}`;

    // Insert the auth.users row directly (bcrypt via pgcrypto, matching
    // GoTrue's own hashing) rather than going through client.auth.signUp —
    // see file header for why.
    // GoTrue's Go structs scan the token columns as plain (non-nullable)
    // strings — a manually-inserted row must set them to '' rather than
    // leaving them NULL, or password sign-in fails with a generic
    // "Database error querying schema" ("converting NULL to string").
    const { rows } = await getPool().query(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at,
         raw_app_meta_data, raw_user_meta_data,
         confirmation_token, recovery_token,
         email_change_token_new, email_change_token_current,
         email_change, phone_change, reauthentication_token
       ) VALUES (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1, crypt($2, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
         '', '', '', '', '', '', ''
       ) RETURNING id`,
      [userEmail, password]
    );
    userId = rows[0].id;
    expect(userId, 'should have created a new auth user').toBeTruthy();

    // GoTrue's password grant also expects an auth.identities row for the
    // "email" provider — without it, sign-in fails with a generic
    // "Database error querying schema".
    await getPool().query(
      `INSERT INTO auth.identities (
         id, provider_id, user_id, identity_data, provider, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1::text, $1::uuid, $2::jsonb, 'email', now(), now()
       )`,
      [userId, JSON.stringify({ sub: userId, email: userEmail, email_verified: false, phone_verified: false })]
    );

    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({ email: userEmail, password });
    expect(signInErr, 'sign-in should succeed for the freshly-created non-admin user').toBeNull();
    expect(signInData.session, 'should have an authenticated session to test the gate against').toBeTruthy();

    // Reads: RLS silently filters, no error, zero rows.
    const { data: custRows, error: custErr } = await client.from('customers').select('id').limit(5);
    expect(custErr, 'SELECT on customers should not error — RLS just filters rows').toBeNull();
    expect(custRows.length, 'non-admin should see zero customer rows').toBe(0);

    const { data: bookingRows, error: bookingErr } = await client.from('bookings').select('id').limit(5);
    expect(bookingErr).toBeNull();
    expect(bookingRows.length, 'non-admin should see zero booking rows').toBe(0);

    const { data: parqRows, error: parqErr } = await client.from('parq').select('id').limit(5);
    expect(parqErr).toBeNull();
    expect(parqRows.length, 'non-admin should see zero parq rows').toBe(0);

    // Write: UPDATE settings should affect zero rows (WITH CHECK denies it).
    const { data: settingsUpdate, error: settingsErr } = await client
      .from('settings').update({ value: 'HACKED' }).eq('key', 'admin_email').select();
    expect(settingsErr, 'UPDATE on settings should not throw — RLS just blocks it').toBeNull();
    expect(settingsUpdate.length, 'non-admin should not be able to update settings').toBe(0);

    const { rows: settingsCheck } = await getPool().query(`SELECT value FROM settings WHERE key = 'admin_email'`);
    expect(settingsCheck[0].value, 'admin_email must be untouched by the non-admin write attempt').not.toBe('HACKED');

    // Write: DELETE on customers should affect zero rows.
    const { data: delData, error: delErr } = await client.from('customers').delete().eq('id', 1).select();
    expect(delErr, 'DELETE on customers should not throw — RLS just blocks it').toBeNull();
    expect(delData.length, 'non-admin should not be able to delete a customer').toBe(0);

    // The #56 cascade-delete RPCs are admin-gated in their own function body
    // (SECURITY DEFINER bypasses RLS) — a non-admin caller must be rejected
    // outright, not just silently no-op.
    const { error: rpcErr } = await client.rpc('admin_delete_customer', { p_customer_id: 999999999 });
    expect(rpcErr, 'admin_delete_customer must reject a non-admin caller').not.toBeNull();
    expect(rpcErr.message).toContain('NOT_ADMIN');
  });
});
