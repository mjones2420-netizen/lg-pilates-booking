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
 * Sets a booking's stripe_payment_intent_id, simulating a card-paid booking
 * confirmed by the stripe-webhook function. Anon has no UPDATE on bookings,
 * so direct pg is required. Used by RF specs to verify the intent is
 * preserved onto the cancellation row when a client is removed from a block.
 */
async function setBookingStripeIntent(bookingId, intentId) {
  await getPool().query(
    `UPDATE bookings SET stripe_payment_intent_id = $1 WHERE id = $2`,
    [intentId, bookingId]
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
 * Directly sets blocks.booked for a given block, bypassing the bookings
 * table entirely. Used by tests that need to simulate a "full" or
 * "near-full" block without inserting real booking rows (EC-01, EC-07).
 *
 * IMPORTANT: this leaves blocks.booked out of sync with the actual booking
 * count. Always pair this with resyncBlockBookedCount(blockId) in an
 * afterEach to restore the correct count before the next test runs.
 *
 * Returns nothing.
 */
async function setBlockBookedCount(blockId, count) {
  await getPool().query(
    `UPDATE blocks SET booked = $1 WHERE id = $2`,
    [count, blockId]
  );
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

/**
 * Resets payment_mode to 'bank_transfer' and clears stripe_publishable_key.
 * Used by ST specs that need a known clean payment mode state before each test.
 * Anon has no UPDATE on settings, so direct pg is required.
 */
async function resetPaymentMode() {
  await getPool().query(
    `UPDATE settings SET value = CASE key
       WHEN 'payment_mode' THEN 'bank_transfer'
       WHEN 'stripe_publishable_key' THEN ''
       ELSE value
     END
     WHERE key IN ('payment_mode', 'stripe_publishable_key')`
  );
}

/**
 * Sets settings.payment_mode to the given value ('bank_transfer' or 'stripe').
 * Anon has no UPDATE on settings, so direct pg is required.
 * Used by ST specs that need PAYMENT_MODE set BEFORE page load (it's read
 * from settings on app init).
 */
async function setPaymentMode(mode) {
  await getPool().query(
    `INSERT INTO settings (key, value) VALUES ('payment_mode', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [mode]
  );
}

/**
 * Returns the most recent pending_bookings row for a given email, or null.
 * anon cannot SELECT pending_bookings (service-role only), so direct pg is
 * the only way to verify rows written by the stripe-checkout Edge Function.
 */
async function getPendingBookingByEmail(email) {
  const { rows } = await getPool().query(
    `SELECT * FROM pending_bookings WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

/**
 * Deletes all pending_bookings rows for a given email.
 * Used by ST specs to clean up rows created by a real stripe-checkout call.
 * Returns the number of rows deleted.
 */
async function deletePendingBookingByEmail(email) {
  const { rowCount } = await getPool().query(
    `DELETE FROM pending_bookings WHERE email = $1`,
    [email]
  );
  return rowCount;
}

/**
 * Returns the number of bookings rows (any status) for a (customer, block)
 * pair. Used to assert that Stripe-mode confirmBooking() does NOT create a
 * real booking row (it should only write to pending_bookings).
 */
async function countBookingsForCustomerOnBlock(customerId, blockId) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM bookings WHERE customer_id = $1 AND block_id = $2`,
    [customerId, blockId]
  );
  return rows[0].count;
}

/**
 * Inserts a pending_bookings row directly via pg, simulating a Stripe
 * checkout session that was started but not completed. anon can INSERT via
 * RLS but cannot SELECT the row back, so direct pg is used for the whole
 * lifecycle in specs that need a pre-existing pending row (e.g. ST-18).
 * Returns the new row's UUID id.
 */
async function insertPendingBooking({ classId, blockId, firstName, lastName, email, phone, customerType, amountPence, parqData = null }) {
  const { rows } = await getPool().query(
    `INSERT INTO pending_bookings
       (class_id, block_id, first_name, last_name, email, phone, customer_type, amount_pence, parq_data, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW(), NOW() + INTERVAL '2 hours')
     RETURNING id`,
    [classId, blockId, firstName, lastName, email, phone, customerType, amountPence, parqData]
  );
  return rows[0].id;
}

/**
 * Returns a pending_bookings row by id, or null.
 */
async function getPendingBookingById(id) {
  const { rows } = await getPool().query(
    `SELECT * FROM pending_bookings WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Deletes a pending_bookings row by id. Returns the number of rows deleted.
 */
async function deletePendingBookingById(id) {
  const { rowCount } = await getPool().query(
    `DELETE FROM pending_bookings WHERE id = $1`,
    [id]
  );
  return rowCount;
}

/**
 * Returns a bookings row by id, or null. Used by ST specs that need to
 * inspect a booking created by the stripe-webhook function (status,
 * stripe_payment_intent_id, stripe_checkout_session_id, customer_id, etc).
 */
async function getBookingById(id) {
  const { rows } = await getPool().query(
    `SELECT * FROM bookings WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Returns a customer row by email, or null. */
async function getCustomerByEmail(email) {
  const { rows } = await getPool().query(
    `SELECT id, first_name, last_name, email FROM customers WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

/** Inserts a catch_up_swaps row directly (bypasses RLS + UI). Returns the new row id. */
async function insertCatchUpSwap(customerId, sourceBlockId, targetBlockId, classDate, notes = null) {
  const { rows } = await getPool().query(
    `INSERT INTO catch_up_swaps (customer_id, source_block_id, target_block_id, class_date, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [customerId, sourceBlockId, targetBlockId, classDate, notes]
  );
  return rows[0].id;
}

/** Deletes all catch_up_swaps rows. */
async function clearCatchUpSwaps() {
  await getPool().query(`DELETE FROM catch_up_swaps`);
}

/** Counts catch_up_swaps rows for a customer+source_block pair. */
async function countCatchUpSwaps(customerId, sourceBlockId) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM catch_up_swaps
     WHERE customer_id = $1 AND source_block_id = $2`,
    [customerId, sourceBlockId]
  );
  return rows[0].count;
}

module.exports = {
  getPool,
  closePool,
  grantManualPriority,
  removeManualPriority,
  hasManualPriority,
  setBookingStatus,
  setBookingStripeIntent,
  resyncBlockBookedCount,
  setBlockBookedCount,
  deleteBookingsForCustomerOnBlock,
  deleteCustomerCascade,
  getParqByCustomerId,
  resetPaymentMode,
  setPaymentMode,
  getPendingBookingByEmail,
  deletePendingBookingByEmail,
  countBookingsForCustomerOnBlock,
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById,
  getBookingById,
  getCustomerByEmail,
  insertCatchUpSwap,
  clearCatchUpSwaps,
  countCatchUpSwaps
};
