/**
 * Schema check helper.
 *
 * Compares the schema fingerprint of the test Supabase project against
 * production. Both projects must have the get_schema_fingerprint() RPC
 * installed (see migrations/10_add_schema_fingerprint_function.sql).
 *
 * Usage:
 *   npm run schema-check
 *
 * Exit codes:
 *   0 — fingerprints match (schemas identical)
 *   1 — fingerprints differ (schemas have drifted)
 *   2 — error talking to one or both projects
 *
 * Reads from .env.test:
 *   TEST_SUPABASE_URL
 *   TEST_SUPABASE_ANON_KEY
 *   PROD_SUPABASE_URL
 *   PROD_SUPABASE_ANON_KEY
 *
 * The anon keys can only call the RPC and read public data — no write access,
 * no admin access. The fingerprint itself is a one-way hash, so it reveals
 * nothing sensitive about the schema.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.test') });

const { createClient } = require('@supabase/supabase-js');

const PROD_URL = process.env.PROD_SUPABASE_URL;
const PROD_KEY = process.env.PROD_SUPABASE_ANON_KEY;
const TEST_URL = process.env.TEST_SUPABASE_URL;
const TEST_KEY = process.env.TEST_SUPABASE_ANON_KEY;

function fail(msg, code = 2) {
  console.error(`❌ ${msg}`);
  process.exit(code);
}

if (!PROD_URL || !PROD_KEY) {
  fail('Missing PROD_SUPABASE_URL or PROD_SUPABASE_ANON_KEY in .env.test');
}
if (!TEST_URL || !TEST_KEY) {
  fail('Missing TEST_SUPABASE_URL or TEST_SUPABASE_ANON_KEY in .env.test');
}

// Defensive: verify the URLs are different. If the same project is used for
// both, the comparison is meaningless.
if (PROD_URL === TEST_URL) {
  fail('PROD_SUPABASE_URL and TEST_SUPABASE_URL are the same — cannot compare a project against itself');
}

async function getFingerprint(label, url, key) {
  const client = createClient(url, key);
  const { data, error } = await client.rpc('get_schema_fingerprint');
  if (error) {
    fail(`${label}: RPC failed — ${error.message}`);
  }
  if (!data || data.length === 0) {
    fail(`${label}: RPC returned no rows`);
  }
  return data[0]; // { fingerprint, total_objects }
}

(async () => {
  console.log('Schema fingerprint check');
  console.log('========================');
  console.log(`PROD: ${PROD_URL}`);
  console.log(`TEST: ${TEST_URL}`);
  console.log('');

  const [prod, test] = await Promise.all([
    getFingerprint('PROD', PROD_URL, PROD_KEY),
    getFingerprint('TEST', TEST_URL, TEST_KEY)
  ]);

  console.log(`PROD: ${prod.fingerprint}  (${prod.total_objects} objects)`);
  console.log(`TEST: ${test.fingerprint}  (${test.total_objects} objects)`);
  console.log('');

  if (prod.fingerprint === test.fingerprint && prod.total_objects === test.total_objects) {
    console.log('✅ Schemas are identical.');
    process.exit(0);
  }

  console.error('⚠️  Schemas differ.');
  if (prod.total_objects !== test.total_objects) {
    console.error(`   Object count: prod=${prod.total_objects}, test=${test.total_objects}`);
  } else {
    console.error('   Object counts match but fingerprints differ — same number of objects, different definitions.');
  }
  console.error('');
  console.error('To investigate, run the snapshot query manually in the Supabase SQL editor');
  console.error('against both projects and diff the results. The query is in:');
  console.error('   migrations/10_add_schema_fingerprint_function.sql');
  console.error('(the body of get_schema_fingerprint, returning the underlying rows instead of the hash)');
  process.exit(1);
})().catch(err => {
  fail(`Unexpected error: ${err.message}`);
});
