// tests/dp-15-grants-and-cron.spec.js
//
// DP (Data Protection) — DP-15: who can run what (#90/#91, migration 34).
//   anon (the public page):
//     - cannot run anonymise_stale_parq or any admin_* data-protection RPC
//     - cannot read terms_versions or data_protection_log
//   authenticated but NOT an admin:
//     - admin_* RPCs raise NOT_ADMIN
//     - cannot run anonymise_stale_parq
//     - reads of the two new tables return no rows (RLS)
//   plus: the nightly 'anonymise-stale-parq' cron job exists at 03:20.
// Role-switching is done inside rolled-back pg transactions (SET LOCAL ROLE
// + request.jwt.claims), so nothing persists and no auth user is needed.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

const ADMIN_RPCS = [
  'SELECT * FROM public.admin_parq_retention_preview(12)',
  'SELECT public.admin_anonymise_customer_parq(999999999)',
  'SELECT public.admin_export_customer(999999999)',
];

async function asRole(role, sql, claimsSub = null) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (claimsSub) {
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: claimsSub, role: 'authenticated' })]);
    }
    await client.query(`SET LOCAL ROLE ${role}`);
    const res = await client.query(sql);
    return { rows: res.rows, error: null };
  } catch (e) {
    return { rows: null, error: e };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

test.describe('DP-15 — Data-protection grants and cron job', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require .env.test populated.');

  test('anon is locked out of the new tables and RPCs', async () => {
    for (const sql of [...ADMIN_RPCS, 'SELECT public.anonymise_stale_parq()',
      'SELECT 1 FROM public.terms_versions', 'SELECT 1 FROM public.data_protection_log']) {
      const { error } = await asRole('anon', sql);
      expect(error, `anon must be denied: ${sql}`).not.toBeNull();
      expect(error.code, `expected permission denied for: ${sql}`).toBe('42501');
    }
    // And through the real REST door the public page uses.
    const { error } = await sb.rpc('admin_export_customer', { p_customer_id: 999999999 });
    expect(error).not.toBeNull();
  });

  test('a signed-in non-admin is rejected by every admin RPC', async () => {
    const nobody = '00000000-0000-4000-8000-00000000d915';
    for (const sql of ADMIN_RPCS) {
      const { error } = await asRole('authenticated', sql, nobody);
      expect(error, `non-admin must be rejected: ${sql}`).not.toBeNull();
      expect(error.message).toContain('NOT_ADMIN');
    }
    const job = await asRole('authenticated', 'SELECT public.anonymise_stale_parq()', nobody);
    expect(job.error && job.error.code).toBe('42501');

    for (const t of ['terms_versions', 'data_protection_log']) {
      const { rows, error } = await asRole('authenticated', `SELECT * FROM public.${t}`, nobody);
      expect(error).toBeNull();
      expect(rows, `non-admin should see no ${t} rows`).toHaveLength(0);
    }
  });

  test('the nightly clear-down job is scheduled', async () => {
    const { rows } = await getPool().query(
      `SELECT schedule, command FROM cron.job WHERE jobname = 'anonymise-stale-parq'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBe('20 3 * * *');
    expect(rows[0].command).toContain('anonymise_stale_parq');
  });
});
