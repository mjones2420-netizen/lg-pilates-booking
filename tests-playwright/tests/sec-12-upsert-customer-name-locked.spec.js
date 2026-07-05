// SEC-12 — upsert_customer is name-locked / phone-open (issue #48)
//
// Before the fix, upsert_customer (anon-callable, no login on the public
// booking flow) OVERWROTE an existing customer's first_name/last_name/phone
// with whatever the caller supplied whenever the email already existed. Anyone
// holding the anon key who knows or guesses a customer's email could corrupt
// Louise's client list — the write-side twin of #35's read leak.
//
// Migration 22 changes the behaviour on an existing-email match to:
//   - name-locked: first_name/last_name are NEVER overwritten;
//   - phone-open:  phone + customer_type ARE refreshed from the form, so a
//                  returning customer's changed number is recorded.
// A booking with a NEW email is unaffected — it still creates a new customer
// row (email is the identity match key; merging is a manual admin job).
//
// Pure DB spec via the shared anon RPC client (sb) — proves the fix at the
// exact trust boundary an attacker would use. Requires migration 22 applied to
// the test project.
//
// Cleanup (afterEach): delete both per-run customers by email.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { deleteCustomerCascade, getCustomerByEmail, getCustomerById } = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;

test.describe('SEC-12 — upsert_customer name-locked / phone-open (#48)', () => {
  test.skip(!SUPABASE_URL, 'TEST_SUPABASE_URL not set');

  const victimEmail = 'sec12-victim@test.example';
  const freshEmail  = 'sec12-fresh@test.example';

  test.afterEach(async () => {
    for (const email of [victimEmail, freshEmail]) {
      const cust = await getCustomerByEmail(email);
      if (cust) await deleteCustomerCascade(cust.id);
    }
  });

  async function upsert({ email, firstName, lastName, phone, type }) {
    const { data: id, error } = await sb.rpc('upsert_customer', {
      p_first_name: firstName,
      p_last_name:  lastName,
      p_email:      email,
      p_phone:      phone,
      p_customer_type: type,
    });
    expect(error, 'upsert_customer should not error').toBeNull();
    return id;
  }

  test('name is locked, phone + type are refreshed on an existing email', async () => {
    // Seed the "real" customer.
    const id = await upsert({
      email: victimEmail, firstName: 'Real', lastName: 'Customer',
      phone: '07700900111', type: 'new',
    });

    // Attacker (or a returning customer) calls upsert again with the SAME email
    // but a different name and phone.
    const idAgain = await upsert({
      email: victimEmail, firstName: 'Hacked', lastName: 'Overwrite',
      phone: '07700900999', type: 'returning',
    });

    // Same customer row — no duplicate created.
    expect(idAgain).toBe(id);

    const row = await getCustomerById(id);
    // name-locked: the stored name must be UNCHANGED.
    expect(row.first_name, 'first_name must not be overwritten').toBe('Real');
    expect(row.last_name, 'last_name must not be overwritten').toBe('Customer');
    // phone-open: phone + customer_type ARE updated.
    expect(row.phone, 'phone must be refreshed from the form').toBe('07700900999');
    expect(row.customer_type, 'customer_type must be refreshed').toBe('returning');
  });

  test('a new email creates a fresh customer row (identity-key behaviour unchanged)', async () => {
    const id = await upsert({
      email: freshEmail, firstName: 'Brand', lastName: 'New',
      phone: '07700900222', type: 'new',
    });
    expect(id).toBeTruthy();

    const row = await getCustomerById(id);
    expect(row.first_name).toBe('Brand');
    expect(row.last_name).toBe('New');
    expect(row.phone).toBe('07700900222');
  });
});
