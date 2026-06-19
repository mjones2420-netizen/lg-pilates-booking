// tests/helpers/stripe-test.js
//
// Shared helper for RF-02 — the only spec that needs a REAL Stripe object to
// act on. RF-02 proves the stripe-refund Edge Function issues a genuine refund,
// so it must first mint a genuine, refundable test-mode charge.
//
// Everything here talks to Stripe TEST MODE only (sk_test_...). No real money
// can ever move. If TEST_STRIPE_SECRET_KEY is absent the calling spec skips.
//
// Requires in .env.test:
//   TEST_STRIPE_SECRET_KEY — the test project's Stripe secret key (sk_test_...).
//                            Same value held by the stripe-refund Edge Function
//                            as STRIPE_SECRET_KEY in the TEST Supabase project.

const STRIPE_API = 'https://api.stripe.com/v1';

function secret() {
  const k = process.env.TEST_STRIPE_SECRET_KEY;
  if (!k) throw new Error('[stripe-test] TEST_STRIPE_SECRET_KEY must be set in .env.test');
  if (!k.startsWith('sk_test_')) {
    throw new Error('[stripe-test] TEST_STRIPE_SECRET_KEY must be a TEST key (sk_test_...) — refusing to run against a live key');
  }
  return k;
}

async function stripePost(path, params) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`[stripe-test] POST ${path} failed: ${json.error?.message || res.status}`);
  }
  return json;
}

async function stripeGet(path) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { 'Authorization': `Bearer ${secret()}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`[stripe-test] GET ${path} failed: ${json.error?.message || res.status}`);
  }
  return json;
}

// Creates and confirms a succeeded PaymentIntent in test mode using Stripe's
// always-succeeds test PaymentMethod (pm_card_visa). Returns the real
// payment_intent id (pi_...), which is then refundable.
async function createRefundablePaymentIntent(amountPence) {
  const pi = await stripePost('/payment_intents', {
    'amount': String(amountPence),
    'currency': 'gbp',
    'payment_method': 'pm_card_visa',
    'confirm': 'true',
    'automatic_payment_methods[enabled]': 'true',
    'automatic_payment_methods[allow_redirects]': 'never',
  });
  if (pi.status !== 'succeeded') {
    throw new Error(`[stripe-test] PaymentIntent not succeeded (status=${pi.status})`);
  }
  return pi.id;
}

// Fetches a PaymentIntent's total refunded amount (pence). Used to assert the
// real refund landed for the exact stored amount.
async function getAmountRefunded(paymentIntentId) {
  const pi = await stripeGet(`/payment_intents/${paymentIntentId}?expand[]=latest_charge`);
  const charge = pi.latest_charge;
  if (!charge || typeof charge === 'string') return 0;
  return charge.amount_refunded || 0;
}

module.exports = { createRefundablePaymentIntent, getAmountRefunded };
