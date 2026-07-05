// tests/helpers/admin-jwt.js
//
// Returns a real authenticated admin access token (JWT) for tests that call
// the send-email Edge Function's authenticated paths directly (ST-21, ST-22,
// SEC-08 server-side template checks).
//
// Why this exists:
//   After #53 the confirmed-booking and card-payment-alert emails are built
//   server-side by send-email and are only reachable by the service-role key
//   or a real admin JWT. The service-role key is not present in .env.test, so
//   these specs authenticate as the test admin (TEST_ADMIN_EMAIL/PASSWORD) —
//   the same credentials loginAsAdmin() uses in the browser — and grab the
//   access token from the sign-in response.
//
//   A dedicated one-off client is used (not the shared anon `sb`) so signing
//   in here never mutates the auth state other specs rely on.

const { createClient } = require('@supabase/supabase-js');

async function getAdminJwt() {
  const url      = process.env.TEST_SUPABASE_URL;
  const anonKey  = process.env.TEST_SUPABASE_ANON_KEY;
  const email    = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!url || !anonKey || !email || !password) {
    throw new Error(
      '[admin-jwt] TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set in .env.test'
    );
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data || !data.session) {
    throw new Error('[admin-jwt] admin sign-in failed: ' + (error ? error.message : 'no session'));
  }
  return data.session.access_token;
}

module.exports = { getAdminJwt };
