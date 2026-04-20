// tests/safety-check.js
//
// CRITICAL: This file is loaded by playwright.config.js BEFORE any tests run.
// It is the single guard that prevents this test suite from ever touching production.
//
// If anything in this file looks suspicious, STOP and confirm with Mark before running.

const PRODUCTION_PROJECT_ID = 'mrlooyixnlxzcfmvnqme';
const PRODUCTION_URL_FRAGMENT = 'mrlooyixnlxzcfmvnqme.supabase.co';

function assertNotProduction() {
  const url       = process.env.TEST_SUPABASE_URL || '';
  const projectId = process.env.TEST_SUPABASE_PROJECT_ID || '';
  const anonKey   = process.env.TEST_SUPABASE_ANON_KEY || '';

  // 1. Project ID must be set and must NOT match production
  if (!projectId) {
    throw new Error(
      '[SAFETY CHECK FAILED] TEST_SUPABASE_PROJECT_ID is not set.\n' +
      'Refusing to run tests with no project ID safety guard.\n' +
      'Copy .env.test.example to .env.test and set the value.'
    );
  }
  if (projectId === PRODUCTION_PROJECT_ID) {
    throw new Error(
      '[SAFETY CHECK FAILED] TEST_SUPABASE_PROJECT_ID matches the PRODUCTION project ID.\n' +
      `  Detected:  ${projectId}\n` +
      `  Production: ${PRODUCTION_PROJECT_ID}\n` +
      'Tests refuse to run against production. Double-check .env.test.'
    );
  }

  // 2. URL must NOT contain the production project reference
  if (url.includes(PRODUCTION_URL_FRAGMENT)) {
    throw new Error(
      '[SAFETY CHECK FAILED] TEST_SUPABASE_URL points at the PRODUCTION project.\n' +
      `  URL:         ${url}\n` +
      `  Prod fragment: ${PRODUCTION_URL_FRAGMENT}\n` +
      'Tests refuse to run against production. Double-check .env.test.'
    );
  }

  // 3. Anon key must be set — we don't validate its contents (can't decode JWT safely
  //    without the library) but a missing one is a symptom of a broken config
  if (!anonKey) {
    throw new Error(
      '[SAFETY CHECK FAILED] TEST_SUPABASE_ANON_KEY is not set.\n' +
      'Tests refuse to run with no anon key. Check .env.test.'
    );
  }

  // 4. Final belt-and-braces: JWT has the project ref baked in. Decode it and cross-check.
  //    The JWT 'ref' claim should match TEST_SUPABASE_PROJECT_ID. If it matches the prod
  //    project ID instead, catch it here.
  try {
    const parts = anonKey.split('.');
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      if (payload.ref === PRODUCTION_PROJECT_ID) {
        throw new Error(
          '[SAFETY CHECK FAILED] TEST_SUPABASE_ANON_KEY is the PRODUCTION anon key.\n' +
          `  Decoded key "ref" claim: ${payload.ref}\n` +
          'Tests refuse to run with a production key. Check .env.test.'
        );
      }
      if (payload.ref && payload.ref !== projectId) {
        throw new Error(
          '[SAFETY CHECK FAILED] Anon key ref does not match TEST_SUPABASE_PROJECT_ID.\n' +
          `  Key ref:    ${payload.ref}\n` +
          `  Project ID: ${projectId}\n` +
          'Config is inconsistent. Check .env.test.'
        );
      }
    }
  } catch (err) {
    // Only re-throw safety errors. Swallow decode errors (newer keys may not decode
    // cleanly as JWT; the other three checks are still in place as defence in depth).
    if (err.message.startsWith('[SAFETY CHECK FAILED]')) throw err;
  }

  console.log(`[safety-check] OK — targeting test project ${projectId}`);
}

module.exports = { assertNotProduction };
