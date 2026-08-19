// SEC-15 — lookup-customer-throttled rate-limits the public lookup path (#35)
//
// Before this fix, the browser called lookup_customer directly with the anon
// key — anyone could hammer it with thousands of different emails to find
// out which addresses belong to real customers (it only returns id+first_name
// since #47, but "exists or not" is itself the leak). This puts a new Edge
// Function in front of it that throttles by IP (migration 27 +
// check_lookup_rate_limit), same "atomic claim" pattern as the #45 one-shot
// email stamps.
//
// The suite itself always passes isTest:true (matches index.html), which
// bypasses the throttle entirely — same short-circuit idiom as send-email's
// Resend skip (#45/session 71) — so the rest of the suite's booking-flow
// specs can't accidentally trip the limit. This spec proves the real,
// non-bypassed path by calling the function directly with isTest left off.
//
// Requires migration 27 + the lookup-customer-throttled function deployed to
// the test project.
//
// Cleanup (afterEach): deleteCustomerCascade removes the per-run customer;
// the rate-limit rows this spec creates are deleted directly (the table has
// no other consumer, so a full clear is safe and keeps reruns deterministic).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { deleteCustomerCascade, getCustomerByEmail, getPool } = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;

const MAX_ATTEMPTS = 20;

test.describe('SEC-15 — lookup-customer-throttled rate limit (#35)', () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, 'TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY not set');

  const email = 'sec15-lookup@test.example';

  test.afterEach(async () => {
    const cust = await getCustomerByEmail(email);
    if (cust) await deleteCustomerCascade(cust.id);
    await getPool().query('DELETE FROM lookup_rate_limits');
  });

  function callLookup(lookupEmail, isTest) {
    return fetch(`${SUPABASE_URL}/functions/v1/lookup-customer-throttled`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(isTest === undefined ? { email: lookupEmail } : { email: lookupEmail, isTest }),
    });
  }

  test('returns the customer id for a known email, empty array for an unknown one', async () => {
    const { data: customerId, error } = await sb.rpc('upsert_customer', {
      p_first_name: 'Sec15',
      p_last_name: 'Lookup',
      p_email: email,
      p_phone: '07000000000',
      p_customer_type: 'new',
    });
    expect(error).toBeNull();

    const known = await callLookup(email, true);
    expect(known.status).toBe(200);
    const knownBody = await known.json();
    expect(knownBody.data.length).toBe(1);
    expect(knownBody.data[0].id).toBe(customerId);

    const unknown = await callLookup('sec15-nobody@test.example', true);
    expect(unknown.status).toBe(200);
    const unknownBody = await unknown.json();
    expect(unknownBody.data.length).toBe(0);
  });

  test('same IP is throttled after the limit; isTest bypasses it', async () => {
    // Burst past the limit with the throttle live (isTest omitted).
    let lastStatus;
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      const res = await callLookup(email);
      lastStatus = res.status;
      if (i < MAX_ATTEMPTS) {
        expect(res.status, `attempt ${i + 1} should be allowed`).toBe(200);
      }
    }
    expect(lastStatus, 'attempt beyond the limit must be refused').toBe(429);

    // The same IP is still over budget here, but isTest:true bypasses the
    // check entirely — proves the suite's normal booking-flow calls are safe.
    const bypassed = await callLookup(email, true);
    expect(bypassed.status, 'isTest calls skip the throttle').toBe(200);
  });
});
