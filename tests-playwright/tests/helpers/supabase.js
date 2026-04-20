// tests/helpers/supabase.js
//
// Shared anon Supabase client for tests that need to hit the DB directly
// (e.g. RPC-level smoke tests, fixture assertions).
//
// This client uses the TEST project anon key — it operates under the anon role
// exactly like an unauthenticated visitor to the booking page would.

const { createClient } = require('@supabase/supabase-js');

const url     = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('[test helper] TEST_SUPABASE_URL and TEST_SUPABASE_ANON_KEY must be set');
}

const sb = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

module.exports = { sb };
