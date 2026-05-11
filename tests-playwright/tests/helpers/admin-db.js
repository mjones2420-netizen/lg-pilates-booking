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

/**
 * Updates a booking's status. Anon has no UPDATE on bookings, so direct pg
 * is required for status flips needed by tests (e.g. simulating a cancelled
 * booking for PB-X4).
 *
 * Status must be one of the values allowed by bookings_status_check:
 *   'reserved', 'confirmed', 'cancelled', 'refund-pending', 'refunded', 'waitlist'
 *
 * Note: this does NOT trigger trg_sync_block_booked_count (which only fires
 * on INSERT/DELETE). If the test depends on blocks.booked being correct
 * after a status change, call resyncBlockBookedCount(blockId) afterwards.
 */
async function setBookingStatus(bookingId, status) {
  await getPool().query(
    `UPDATE bookings SET status = $1 WHERE id = $2`,
    [status, bookingId]
  );
}

/**
 * Recalculates blocks.booked from the actual non-cancelled booking count.
 * Mirrors the body of sync_block_booked_count() so tests can run it after
 * raw SQL changes that bypass the app-level trigger.
 *
 * Pass a blockId to resync a single block, or omit to resync all blocks.
 */
async function resyncBlockBookedCount(blockId = null) {
  if (blockId == null) {
    await getPool().query(
      `UPDATE blocks b
       SET booked = (
         SELECT COUNT(*) FROM bookings
         WHERE block_id = b.id AND status != 'cancelled'
       )`
    );
  } else {
    await getPool().query(
      `UPDATE blocks
       SET booked = (
         SELECT COUNT(*) FROM bookings
         WHERE block_id = $1 AND status != 'cancelled'
       )
       WHERE id = $1`,
      [blockId]
    );
  }
}

/**
 * Deletes any non-cancelled bookings for a (customer, block) pair, used by
 * tests that need to reset their own state before re-running without a full
 * reseed (e.g. CB-13 self-cleaning).
 *
 * Foreign keys handle the cascade for us:
 *   - parq.booking_id has ON DELETE CASCADE → PAR-Q rows go automatically
 *
 * Cancellations rows are NOT deleted — those exist only when the admin
 * goes through the cancel-and-refund flow, which CB-13 doesn't trigger.
 *
 * After deletion this helper resyncs blocks.booked because the
 * trg_sync_block_booked_count trigger only fires on app-level operations.
 *
 * Returns the number of booking rows deleted (0 or more).
 */
async function deleteBookingsForCustomerOnBlock(customerId, blockId) {
  const { rowCount } = await getPool().query(
    `DELETE FROM bookings
     WHERE customer_id = $1 AND block_id = $2 AND status != 'cancelled'`,
    [customerId, blockId]
  );
  await resyncBlockBookedCount(blockId);
  return rowCount;
}

/**
 * Deletes a customer and all their bookings (parq cascades via FK).
 * Used by tests that create per-run customers and want to clean up on exit.
 *
 * Deletion order follows the FK chain: bookings → customer.
 * (parq cascades via parq.booking_id ON DELETE CASCADE.)
 *
 * Cancellations rows are NOT deleted — those are denormalised audit records
 * that should survive even if the customer is later deleted (per schema design).
 *
 * Returns the number of customer rows deleted (0 or 1).
 */
async function deleteCustomerCascade(customerId) {
  await getPool().query(`DELETE FROM bookings WHERE customer_id = $1`, [customerId]);
  const { rowCount } = await getPool().query(
    `DELETE FROM customers WHERE id = $1`,
    [customerId]
  );
  await resyncBlockBookedCount();
  return rowCount;
}

/**
 * Returns the most recent parq row for a given customer (or null).
 * Used by CB-33 to assert that the PAR-Q insert from the booking flow
 * actually landed in the DB with the expected field values.
 *
 * Anon has INSERT-only on parq (no SELECT), so this direct pg helper is
 * the only way to verify parq row contents from a test.
 *
 * Returns the full row including all 12 qN_* columns, age, emergency_*,
 * print_name, sign_date, yes_details, additional_notes, booking_id.
 */
async function getParqByCustomerId(customerId) {
  const { rows } = await getPool().query(
    `SELECT * FROM parq WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
    [customerId]
  );
  return rows[0] || null;
}

module.exports = {
  getPool,
  closePool,
  grantManualPriority,
  removeManualPriority,
  hasManualPriority,
  setBookingStatus,
  resyncBlockBookedCount,
  deleteBookingsForCustomerOnBlock,
  deleteCustomerCascade,
  getParqByCustomerId
};
