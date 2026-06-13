// tests/sec-07-anon-grant-matrix.spec.js
//
// SEC (Security) — Grant matrix audit.
// Covers scenario:
//   SEC-07: Grant matrix matches context.txt spec (one-off verification)
//
// Security framing:
//   After the Item-20 grant tightening, the anon role should have only the
//   following table privileges (per context.txt ANON ROLE GRANTS):
//
//     blocks           → SELECT
//     classes          → SELECT
//     parq             → INSERT
//     pending_bookings → INSERT
//     settings         → SELECT
//
//   All other tables (bookings, customers, cancellations, waitlist,
//   customer_class_priority) should have NO anon grants. Public reads of
//   customer or booking data must go through SECURITY DEFINER functions.
//
//   This spec is the canary for accidental grant regressions. If someone
//   later adds `GRANT SELECT ON bookings TO anon` either deliberately or
//   via a misconfigured Supabase dashboard click, this test fires.
//
// Why direct pg (not anon SELECT on information_schema):
//   information_schema returns role-relative results — the anon role would
//   only see its own grants, but we want a full picture of what's been
//   granted. Direct pg via admin-db.js sees everything.
//
//   This is a database-level safety net: the assertion is on the live
//   grant matrix, not on application behaviour. It would catch a grant
//   change made outside this codebase (e.g. via the Supabase dashboard).
//
// What a fail would mean:
//   - Anon has gained grants on a table it shouldn't: a security regression
//     that potentially exposes customer/booking data.
//   - Anon has lost grants on settings/classes/blocks/parq: the public
//     booking flow will silently break.

const { test, expect } = require('@playwright/test');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

// Expected anon grants per context.txt ANON ROLE GRANTS section.
// Map of table_name → array of privileges (sorted).
const EXPECTED_ANON_GRANTS = {
  blocks:            ['SELECT'],
  classes:           ['SELECT'],
  parq:              ['INSERT'],
  pending_bookings:  ['INSERT'],
  settings:          ['SELECT'],
};

// Tables that MUST NOT have any anon grants.
const FORBIDDEN_ANON_TABLES = [
  'bookings',
  'customers',
  'cancellations',
  'waitlist',
  'customer_class_priority',
];

test.describe('SEC-07 — Anon grant matrix audit', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — SEC specs require .env.test populated.');

  test('SEC-07 — anon grant matrix matches the documented spec', async () => {
    // Query the live grant matrix via direct pg. We aggregate privileges per
    // table_name into a sorted, comma-separated string so the assertion is
    // order-independent and easy to inspect on failure.
    const { rows } = await getPool().query(`
      SELECT
        table_name,
        string_agg(privilege_type, ',' ORDER BY privilege_type) AS anon_privs
      FROM information_schema.role_table_grants
      WHERE grantee = 'anon'
        AND table_schema = 'public'
      GROUP BY table_name
      ORDER BY table_name
    `);

    // Build an actual map for direct comparison with EXPECTED_ANON_GRANTS.
    const actualGrants = {};
    for (const row of rows) {
      actualGrants[row.table_name] = row.anon_privs.split(',');
    }

    // 1. Expected tables must exist with the expected privileges.
    for (const [table, expectedPrivs] of Object.entries(EXPECTED_ANON_GRANTS)) {
      expect(
        actualGrants[table],
        `Anon should have grants on "${table}" — table is missing from the grant matrix entirely. ` +
        `A required public-facing grant has been revoked.`
      ).toBeDefined();
      expect(
        actualGrants[table].sort(),
        `Anon grants on "${table}" do not match the documented spec. ` +
        `Expected ${expectedPrivs.join(',')}, got ${actualGrants[table].join(',')}.`
      ).toEqual(expectedPrivs.sort());
    }

    // 2. Forbidden tables must NOT appear in the grant matrix at all.
    for (const table of FORBIDDEN_ANON_TABLES) {
      expect(
        actualGrants[table],
        `Anon has unexpected grants on "${table}" (${actualGrants[table] ? actualGrants[table].join(',') : ''}). ` +
        `This is a security regression — anon should have NO grants on ${table}. ` +
        `Public reads must go through a SECURITY DEFINER function instead.`
      ).toBeUndefined();
    }

    // 3. Catch surprise tables — anything in the actual grant matrix that
    //    isn't either expected or one of the forbidden tables (which we
    //    already know are absent from the failure above). This guards
    //    against a new table being added with default anon grants.
    const expectedTableNames = Object.keys(EXPECTED_ANON_GRANTS);
    const surpriseTables = Object.keys(actualGrants).filter(
      t => !expectedTableNames.includes(t)
    );
    expect(
      surpriseTables,
      `Anon has grants on unexpected tables: ${surpriseTables.join(', ')}. ` +
      `If this is intentional, update EXPECTED_ANON_GRANTS in this spec ` +
      `AND the ANON ROLE GRANTS section of context.txt.`
    ).toEqual([]);
  });
});
