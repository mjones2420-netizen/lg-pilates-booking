// ST-20 — Webhook success: PAR-Q saved for new client
//
// What this proves:
//   Same flow as ST-19, but the pending_bookings row has customer_type='new'
//   and a populated parq_data JSONB blob. stripe-webhook must insert a parq
//   row linked to the new booking_id, with age, emergency contact details,
//   print_name, sign_date, yes_details, additional_notes, and all 12
//   qN_* question answers correctly mapped from parq_data.answers.
//
// Approach:
//   A pending_bookings row is inserted with customer_type='new' and parq_data
//   matching the shape confirmBooking() builds in the front end (see
//   index.html's pendingParq object). A signed checkout.session.completed
//   event is POSTed directly to stripe-webhook (no real Stripe contact). The
//   resulting parq row is fetched via getParqByCustomerId and checked field
//   by field, including all 12 PAR-Q question keys.
//
// Side effects (non-fatal, by design):
//   Fires the real client confirmation + admin alert emails via send-email,
//   both redirected to delivered@resend.dev because is_test='true'.
//
// Cleanup:
//   afterEach deletes the created booking + customer. parq.booking_id has
//   ON DELETE CASCADE, so the parq row is removed automatically.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById,
  deleteCustomerCascade,
  getBookingById,
  getParqByCustomerId
} = require('./helpers/admin-db');
const { buildCheckoutCompletedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

const TEST_EMAIL = `st20-${Date.now()}@test.example`;

const PARQ_DATA = {
  age: '34',
  emergency_name: 'Jordan Webhook',
  emergency_relationship: 'Sibling',
  emergency_phone: '07700900220',
  yes_details: 'Mild asthma, managed with inhaler.',
  additional_notes: 'No further notes.',
  print_name: 'Webhook Newclient',
  sign_date: '2026-06-15',
  answers: {
    q1_heart: 'No',
    q2_circulatory: 'No',
    q3_blood_pressure: 'No',
    q4_chest_pain: 'No',
    q5_joint: 'No',
    q6_dizziness: 'No',
    q7_pregnant: 'No',
    q8_doctor_advised: 'No',
    q9_spinal: 'No',
    q10_medication: 'No',
    q11_asthma: 'Yes',
    q12_other_reasons: 'No'
  }
};

test.describe('ST-20 — Webhook success saves PAR-Q for new client', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let pendingId = null;
  let createdBookingId = null;
  let createdCustomerId = null;

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId); // cascades bookings -> parq, resyncs blocks.booked
    }
    if (pendingId) {
      await deletePendingBookingById(pendingId); // defensive — webhook should already delete it
    }
  });

  test('parq row is created with correct field mapping and all 12 question answers', async () => {
    const blk = await getBlockByRole('fri-upcoming');

    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Webhook',
      lastName: 'Newclient',
      email: TEST_EMAIL,
      phone: '07700900221',
      customerType: 'new',
      amountPence: 6000,
      parqData: PARQ_DATA
    });

    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });
    const { status, json } = await postToStripeWebhook(event);

    expect(status).toBe(200);
    expect(json).not.toBeNull();
    expect(json.received).toBe(true);
    expect(json.booking_id).toBeTruthy();
    createdBookingId = json.booking_id;

    const pendingAfter = await getPendingBookingById(pendingId);
    expect(pendingAfter).toBeNull();
    pendingId = null;

    const booking = await getBookingById(createdBookingId);
    expect(booking).not.toBeNull();
    expect(booking.status).toBe('confirmed');
    createdCustomerId = booking.customer_id;

    // customers row upserted as 'new'
    const lookupRes = await sb.rpc('lookup_customer', { p_email: TEST_EMAIL });
    expect(lookupRes.error).toBeNull();
    expect(lookupRes.data.length).toBeGreaterThan(0);

    // parq row linked to the new booking, with all fields mapped correctly
    const parq = await getParqByCustomerId(createdCustomerId);
    expect(parq).not.toBeNull();
    expect(Number(parq.booking_id)).toBe(Number(createdBookingId));
    expect(Number(parq.customer_id)).toBe(Number(createdCustomerId));
    expect(String(parq.age)).toBe(PARQ_DATA.age);
    expect(parq.emergency_name).toBe(PARQ_DATA.emergency_name);
    expect(parq.emergency_relationship).toBe(PARQ_DATA.emergency_relationship);
    expect(parq.emergency_phone).toBe(PARQ_DATA.emergency_phone);
    expect(parq.yes_details).toBe(PARQ_DATA.yes_details);
    expect(parq.additional_notes).toBe(PARQ_DATA.additional_notes);
    expect(parq.print_name).toBe(PARQ_DATA.print_name);
    const signDate = parq.sign_date;
    const signDateStr = `${signDate.getFullYear()}-${String(signDate.getMonth() + 1).padStart(2, '0')}-${String(signDate.getDate()).padStart(2, '0')}`;
    expect(signDateStr).toBe(PARQ_DATA.sign_date);

    // All 12 PAR-Q question answers mapped from parq_data.answers
    for (const [key, expectedVal] of Object.entries(PARQ_DATA.answers)) {
      expect(parq[key]).toBe(expectedVal);
    }
  });
});
