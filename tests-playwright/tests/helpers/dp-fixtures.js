// tests/helpers/dp-fixtures.js
//
// Per-spec data for the Data Protection (DP) specs (#90/#91, migration 34).
// Builds a throwaway customer with bookings + a PAR-Q directly via pg, so the
// retention specs can place someone exactly where they need on the timeline
// without driving the booking UI. Specs clean up with cleanupDpCustomer().
//
// Dates: block end dates come from getBlockByRole() (fixture dates move on
// every reseed), and "today" for the clear-down is faked with asOf — never
// derive anything from the real calendar.

const { getPool, resyncBlockBookedCount, deleteDataProtectionLog } = require('./admin-db');

const PARQ_ANSWERS = {
  q1_heart: 'No', q2_circulatory: 'No', q3_blood_pressure: 'Yes', q4_chest_pain: 'No',
  q5_joint: 'No', q6_dizziness: 'No', q7_pregnant: 'No', q8_doctor_advised: 'No',
  q9_spinal: 'No', q10_medication: 'No', q11_asthma: 'No', q12_other_reasons: 'No',
};

/** 'YYYY-MM-DD' shifted by whole months / days (local-date arithmetic, no toISOString). */
function shiftDate(ymd, { months = 0, days = 0 } = {}) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Creates a customer, one booking per block, and a PAR-Q (linked to the
 * first booking) with health answers + emergency contact filled in.
 *   blocks:        array of fixture block objects (from getBlockByRole)
 *   parqCreatedAt: 'YYYY-MM-DD' for parq.created_at (default: first block's end date)
 *   customerType:  'new' | 'returning'
 *   lastName:      unique per spec, so admin-UI specs can find their own row
 * Returns { customerId, bookingIds, parqId, email }.
 */
async function createDpCustomer({ tag, blocks, parqCreatedAt = null, customerType = 'new', withParq = true, lastName = 'Protect' }) {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.example`;
  const pool = getPool();
  const { rows: [cust] } = await pool.query(
    `INSERT INTO customers (first_name, last_name, email, phone, customer_type)
     VALUES ('Data', $3, $1, '07700900990', $2) RETURNING id`,
    [email, customerType, lastName]
  );
  const bookingIds = [];
  for (const blk of blocks) {
    const { rows: [bk] } = await pool.query(
      `INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
       VALUES ($1, $2, $3, 'confirmed', 60) RETURNING id`,
      [blk.class_id, blk.id, cust.id]
    );
    bookingIds.push(bk.id);
  }
  let parqId = null;
  if (withParq) {
    const created = parqCreatedAt || blocks[0].end_date;
    const { rows: [pq] } = await pool.query(
      `INSERT INTO parq (booking_id, customer_id, age,
         q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain, q5_joint, q6_dizziness,
         q7_pregnant, q8_doctor_advised, q9_spinal, q10_medication, q11_asthma, q12_other_reasons,
         yes_details, additional_notes, emergency_name, emergency_relationship, emergency_phone,
         print_name, sign_date, created_at)
       VALUES ($1, $2, '41', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         'High blood pressure, medicated', 'Prefers mat near the door', 'Sam Contact', 'Partner', '07700900991',
         'Data Protect', $15::date, $15::timestamp)
       RETURNING id`,
      [bookingIds[0], cust.id, ...Object.values(PARQ_ANSWERS), created]
    );
    parqId = pq.id;
  }
  await resyncBlockBookedCount();
  return { customerId: cust.id, bookingIds, parqId, email };
}

/** Removes everything createDpCustomer made (plus log rows / waitlist / pending). */
async function cleanupDpCustomer(customerId, email = null) {
  if (!customerId) return;
  const pool = getPool();
  await pool.query(`DELETE FROM waitlist WHERE customer_id = $1`, [customerId]);
  if (email) await pool.query(`DELETE FROM pending_bookings WHERE lower(email) = lower($1)`, [email]);
  await pool.query(`DELETE FROM parq WHERE customer_id = $1`, [customerId]);
  await pool.query(`DELETE FROM bookings WHERE customer_id = $1`, [customerId]);
  await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  await deleteDataProtectionLog(customerId);
  await resyncBlockBookedCount();
}

module.exports = { createDpCustomer, cleanupDpCustomer, shiftDate, PARQ_ANSWERS };
