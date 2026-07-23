// SEC-14 — email matching is case-insensitive (issue #78)
//
// Three anon-callable SECURITY DEFINER functions matched customer email with a
// plain case-sensitive `=`, and the front end only .trim()s the input. So a
// customer whose stored email is lower-case but who types a different case
// looked like a DIFFERENT person:
//
//   check_priority_access — returned FALSE (access denied) for a holder of
//                           priority. This wrongly refused Mark on PROD
//                           (2026-07-06, `Mjones970@live.co.uk`).
//   lookup_customer       — a returning customer read as brand-new.
//   upsert_customer       — a different-case email created a DUPLICATE row.
//
// Migration 25 compares LOWER(email) = LOWER(p_email) in all three. These
// specs prove a mixed-case query still matches the stored lower-case row.
//
// Pure DB specs via the shared anon RPC client (sb) — the exact trust boundary
// the public booking page uses. Requires migration 25 applied to the test
// project.
//
// Cleanup (afterEach): remove the manual-priority grant, then delete the
// per-run customer by email.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const {
  getCustomerByEmail, getCustomerById, deleteCustomerCascade,
  grantManualPriority, removeManualPriority,
} = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;

test.describe('SEC-14 — case-insensitive email matching (#78)', () => {
  test.skip(!SUPABASE_URL, 'TEST_SUPABASE_URL not set');

  // Stored lower-case; queried upper-case. Different case, same person.
  const storedEmail  = 'sec14-mixed@test.example';
  const queryEmail   = 'SEC14-MIXED@TEST.EXAMPLE';

  let priorityClassId = null; // set by the priority test, cleared in afterEach

  test.afterEach(async () => {
    const cust = await getCustomerByEmail(storedEmail);
    if (cust) {
      if (priorityClassId !== null) await removeManualPriority(cust.id, priorityClassId);
      await deleteCustomerCascade(cust.id);
    }
    priorityClassId = null;
  });

  async function createCustomer({ firstName = 'Real', lastName = 'Customer' } = {}) {
    const { data: id, error } = await sb.rpc('upsert_customer', {
      p_first_name: firstName, p_last_name: lastName,
      p_email: storedEmail, p_phone: '07700900111', p_customer_type: 'new',
    });
    expect(error, 'seed upsert_customer should not error').toBeNull();
    return id;
  }

  test('lookup_customer matches a mixed-case query against a lower-case row', async () => {
    const id = await createCustomer();

    const { data, error } = await sb.rpc('lookup_customer', { p_email: queryEmail });
    expect(error, 'lookup_customer should not error').toBeNull();
    // Returns the existing customer, not an empty result (which the front end
    // reads as "brand-new customer").
    expect(Array.isArray(data) ? data.length : 0, 'mixed-case lookup must find the row').toBe(1);
    expect(data[0].id).toBe(id);
    expect(data[0].first_name).toBe('Real');
  });

  test('upsert_customer with a mixed-case email matches the existing row (no duplicate)', async () => {
    const id = await createCustomer();

    // Same person, different case, different name typed in.
    const { data: idAgain, error } = await sb.rpc('upsert_customer', {
      p_first_name: 'Should', p_last_name: 'NotClone',
      p_email: queryEmail, p_phone: '07700900222', p_customer_type: 'returning',
    });
    expect(error, 'upsert_customer should not error').toBeNull();

    // Matched the existing row — no second customer created.
    expect(idAgain, 'mixed-case upsert must return the SAME id, not a new one').toBe(id);

    const row = await getCustomerById(id);
    // name-locked (from #48) still holds; phone/type refreshed.
    expect(row.first_name).toBe('Real');
    expect(row.phone).toBe('07700900222');
    expect(row.customer_type).toBe('returning');
  });

  test('check_priority_access grants a mixed-case email its manual priority', async () => {
    const id = await createCustomer();
    const block = await getBlockByRole('mon-upcoming');
    priorityClassId = block.class_id;

    await grantManualPriority(id, block.class_id);

    const { data: granted, error } = await sb.rpc('check_priority_access', {
      p_email: queryEmail, p_block_id: block.id,
    });
    expect(error, 'check_priority_access should not error').toBeNull();
    // The bug that refused Mark: this returned FALSE for a valid priority holder
    // whose email case differed. Must be TRUE now.
    expect(granted, 'mixed-case priority holder must be granted access').toBe(true);
  });
});
