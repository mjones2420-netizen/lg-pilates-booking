// tests/helpers/admin-db.js
//
// Direct Postgres helper for tests that need to read or write tables that
// the anon role can't touch (e.g. customer_class_priority, bookings, customers).
//
// Why this exists:
//   The shared `sb` client in supabase.js is anon-only — it has no SELECT
//   on customer_class_priority and several other admin-side tables. Using
//   it for fixture writes/reads results in silent no-ops (RLS returns null).
//
//   This helper opens a direct Postgres connection using TEST_SUPABASE_DB_URL
//   (the same connection string `npm run seed` uses), bypassing RLS entirely.
//   It is for TEST FIXTURE management only — not for app behaviour testing.
//
// Safety:
//   The connection only runs against the test DB URL. The seed script's
//   safety checks already verify TEST_SUPABASE_DB_URL doesn't reference the
//   production project. We add the same check here as belt-and-braces.
//
// Connection lifecycle:
//   - One pool per Node process, lazily created on first call.
//   - Pool is closed automatically when Playwright tears down the worker
//     (Node will hold the process open without it).
//   - Each helper acquires/releases a single client per call — no long-lived
//     transactions.

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;

  const dbUrl = process.env.TEST_SUPABASE_DB_URL;
  if (!dbUrl) {
    throw new Error(
      '[admin-db] TEST_SUPABASE_DB_URL must be set in .env.test'
    );
  }

  // Belt-and-braces: refuse to run against production.
  if (dbUrl.includes('mrlooyixnlxzcfmvnqme')) {
    throw new Error(
      '[admin-db] TEST_SUPABASE_DB_URL points at production — refusing to connect.'
    );
  }

  pool = new Pool({ connectionString: dbUrl, max: 2 });
  return pool;
}

/**
 * Closes the connection pool. Call from a global teardown if needed —
 * Playwright's default worker shutdown handles this in most cases, but
 * explicit close is harmless.
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Inserts a manual priority grant. No-op (silent) if one already exists,
 * thanks to the unique (customer_id, class_id) constraint and ON CONFLICT.
 */
async function grantManualPriority(customerId, classId) {
  await getPool().query(
    `INSERT INTO customer_class_priority (customer_id, class_id)
     VALUES ($1, $2)
     ON CONFLICT (customer_id, class_id) DO NOTHING`,
    [customerId, classId]
  );
}

/**
 * Deletes a manual priority grant. No-op (silent) if no row exists.
 */
async function removeManualPriority(customerId, classId) {
  await getPool().query(
    `DELETE FROM customer_class_priority
     WHERE customer_id = $1 AND class_id = $2`,
    [customerId, classId]
  );
}

/**
 * Returns true if the (customer, class) pair has a manual priority row.
 */
async function hasManualPriority(customerId, classId) {
  const { rows } = await getPool().query(
    `SELECT 1 FROM customer_class_priority
     WHERE customer_id = $1 AND class_id = $2 LIMIT 1`,
    [customerId, classId]
  );
  return rows.length > 0;
}

module.exports = {
  getPool,
  closePool,
  grantManualPriority,
  removeManualPriority,
  hasManualPriority
};
