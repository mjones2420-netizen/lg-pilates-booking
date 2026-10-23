// tests/dp-06-stripe-path-consent.spec.js
//
// DP (Data Protection) — DP-06: the card-payment path records terms and
// consent (#90/#91).
//   1. stripe-checkout rejects an unknown terms version with a 400 BEFORE
//      Stripe is contacted (no pending row is written).
//   2. stripe-checkout with valid versions stores terms_version +
//      terms_accepted_at on the pending row and stamps
//      parq_data.health_consent_at server-side.
//   3. stripe-webhook copies the terms record onto the confirmed booking and
//      the consent record onto the parq row.
//
// Fixture role: fri-upcoming. Self-cleaning.

const { test, expect } = require('@playwright/test');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking, getPendingBookingByEmail, deletePendingBookingByEmail, deletePendingBookingById,
  deleteCustomerCascade, deleteDataProtectionLog, getBookingById, getParqByCustomerId
} = require('./helpers/admin-db');
const { buildCheckoutCompletedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const APP_URL = process.env.TEST_APP_URL || 'http://localhost:8000';

const PARQ = {
  age: '36', emergency_name: 'Card Contact', emergency_relationship: 'Friend', emergency_phone: '07700900961',
  yes_details: '', additional_notes: '', print_name: 'Card Consent', sign_date: '2026-10-05',
  answers: { q1_heart: 'No', q2_circulatory: 'No', q3_blood_pressure: 'No', q4_chest_pain: 'No',
    q5_joint: 'No', q6_dizziness: 'No', q7_pregnant: 'No', q8_doctor_advised: 'No', q9_spinal: 'No',
    q10_medication: 'No', q11_asthma: 'No', q12_other_reasons: 'No' },
  declaration_version: 'parq-decl-2026-10',
  health_consent_version: 'health-consent-2026-10',
};

test.describe('DP-06 — Card payment path records terms and consent', () => {
  test.skip(!SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  const emails = [];
  let pendingId = null;
  let customerId = null;

  test.afterEach(async () => {
    for (const e of emails.splice(0)) await deletePendingBookingByEmail(e);
    if (pendingId) await deletePendingBookingById(pendingId);
    if (customerId) { await deleteCustomerCascade(customerId); await deleteDataProtectionLog(customerId); }
    pendingId = null; customerId = null;
  });

  async function callCheckout(blk, email, extra) {
    return fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: blk.class_id, block_id: blk.id,
        first_name: 'Dp', last_name: 'Six', email, phone: '07700900906',
        customer_type: 'new', class_name: 'Test Class',
        success_url: `${APP_URL}?success=true`, cancel_url: `${APP_URL}?cancelled=true`,
        is_test: true, ...extra,
      }),
    });
  }

  test('checkout rejects an unknown terms version before Stripe', async () => {
    const blk = await getBlockByRole('fri-upcoming');
    const email = `dp06a-${Date.now()}@test.example`;
    emails.push(email);
    const res = await callCheckout(blk, email, { terms_version: 'tcs-bogus', parq_data: PARQ });
    expect(res.status).toBe(400);
    expect(await getPendingBookingByEmail(email), 'no pending row for a rejected version').toBeNull();
  });

  test('checkout stores the terms record and stamps consent time server-side', async () => {
    const blk = await getBlockByRole('fri-upcoming');
    const email = `dp06b-${Date.now()}@test.example`;
    emails.push(email);
    const res = await callCheckout(blk, email, {
      terms_version: 'tcs-2026-10',
      parq_data: { ...PARQ, health_consent_at: '1999-01-01T00:00:00Z' }, // forged — must be replaced
    });
    expect(res.status).toBe(200);
    const pending = await getPendingBookingByEmail(email);
    expect(pending).not.toBeNull();
    expect(pending.terms_version).toBe('tcs-2026-10');
    expect(pending.terms_accepted_at).toBeTruthy();
    expect(pending.parq_data.health_consent_at).toBeTruthy();
    expect(pending.parq_data.health_consent_at.startsWith('1999')).toBe(false);
  });

  test('checkout without a consent version stamps no consent time', async () => {
    // The booking form stopped sending health_consent_version (box removed 23 Oct 2026).
    const blk = await getBlockByRole('fri-upcoming');
    const email = `dp06d-${Date.now()}@test.example`;
    emails.push(email);
    const { health_consent_version, ...parqNoConsent } = PARQ;
    const res = await callCheckout(blk, email, { terms_version: 'tcs-2026-10', parq_data: parqNoConsent });
    expect(res.status).toBe(200);
    const pending = await getPendingBookingByEmail(email);
    expect(pending).not.toBeNull();
    expect(pending.terms_version).toBe('tcs-2026-10');
    expect(pending.parq_data.health_consent_at).toBeNull();
  });

  test('webhook copies terms onto the booking and consent onto the parq row', async () => {
    const blk = await getBlockByRole('fri-upcoming');
    const email = `dp06c-${Date.now()}@test.example`;
    const acceptedAt = new Date().toISOString();
    pendingId = await insertPendingBooking({
      classId: blk.class_id, blockId: blk.id, firstName: 'Dp', lastName: 'SixWebhook', email,
      phone: '07700900966', customerType: 'new', amountPence: 6000,
      parqData: { ...PARQ, health_consent_at: acceptedAt },
      termsVersion: 'tcs-2026-10', termsAcceptedAt: acceptedAt,
    });

    const { status, json } = await postToStripeWebhook(buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) }));
    expect(status).toBe(200);
    expect(json.booking_id).toBeTruthy();
    pendingId = null; // webhook deletes it

    const booking = await getBookingById(json.booking_id);
    customerId = booking.customer_id;
    expect(booking.status).toBe('confirmed');
    expect(booking.terms_version).toBe('tcs-2026-10');
    expect(booking.terms_accepted_at).toBeTruthy();

    const parq = await getParqByCustomerId(customerId);
    expect(parq).not.toBeNull();
    expect(parq.declaration_version).toBe('parq-decl-2026-10');
    expect(parq.health_consent_version).toBe('health-consent-2026-10');
    expect(parq.health_consent_at).toBeTruthy();
  });
});
