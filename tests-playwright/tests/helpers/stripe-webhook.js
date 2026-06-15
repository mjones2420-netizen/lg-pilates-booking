// tests/helpers/stripe-webhook.js
//
// Shared helper for ST-19 through ST-26 — these specs POST a fabricated but
// correctly-signed Stripe `checkout.session.completed` event directly to the
// stripe-webhook Edge Function. Stripe itself is never contacted: this is a
// hand-built HTTP request that matches the shape stripe-webhook/index.ts
// expects, signed with the same HMAC-SHA256 scheme Stripe uses.
//
// Signature scheme (mirrors verifyStripeSignature in stripe-webhook/index.ts):
//   header = "t=<unix_ts>,v1=<hex hmac-sha256 of '<unix_ts>.<rawBody>'>"
//
// Requires in .env.test:
//   TEST_SUPABASE_URL          — used to build the webhook URL
//   TEST_STRIPE_WEBHOOK_SECRET — the test project's stripe-webhook
//                                 STRIPE_WEBHOOK_SECRET value (from Supabase
//                                 dashboard → Edge Functions → stripe-webhook
//                                 → Secrets)

const crypto = require('crypto');

const WEBHOOK_URL = process.env.TEST_SUPABASE_URL
  ? `${process.env.TEST_SUPABASE_URL}/functions/v1/stripe-webhook`
  : null;

/**
 * Builds a "stripe-signature" header value for a given raw JSON body string.
 * Mirrors Stripe's own signing scheme so stripe-webhook's HMAC check passes.
 */
function signPayload(rawBody, timestamp = Math.floor(Date.now() / 1000)) {
  const secret = process.env.TEST_STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('[stripe-webhook helper] TEST_STRIPE_WEBHOOK_SECRET must be set in .env.test');
  }
  const signedPayload = `${timestamp}.${rawBody}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Builds a minimal but valid checkout.session.completed event payload.
 *
 * `pendingBookingId` is required — everything else has sensible defaults.
 * `isTest: true` (default) sets metadata.is_test = "true", which the webhook
 * passes through to send-email so any triggered emails are redirected to
 * delivered@resend.dev rather than real inboxes.
 */
function buildCheckoutCompletedEvent({
  pendingBookingId,
  sessionId = `cs_test_${Date.now()}`,
  paymentIntentId = `pi_test_${Date.now()}`,
  isTest = true,
  appBaseUrl = 'http://localhost:8000/?env=test',
  extraMetadata = {}
}) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        payment_intent: paymentIntentId,
        metadata: {
          pending_booking_id: pendingBookingId,
          is_test: isTest ? 'true' : 'false',
          app_base_url: appBaseUrl,
          ...extraMetadata
        }
      }
    }
  };
}

/**
 * Posts an event payload to the stripe-webhook Edge Function with a valid
 * signature (unless overridden).
 *
 * Options:
 *   rawBodyOverride        — send this exact string as the body instead of
 *                             JSON.stringify(eventPayload) (e.g. malformed JSON)
 *   signatureHeaderOverride — send this exact string as stripe-signature, or
 *                             null to omit the header entirely (signature tests)
 *   timestamp              — override the signed timestamp
 *
 * Returns { status, json } — json is null if the response wasn't valid JSON.
 */
async function postToStripeWebhook(eventPayload, { rawBodyOverride = null, signatureHeaderOverride = undefined, timestamp } = {}) {
  if (!WEBHOOK_URL) {
    throw new Error('[stripe-webhook helper] TEST_SUPABASE_URL must be set in .env.test');
  }
  const rawBody = rawBodyOverride !== null ? rawBodyOverride : JSON.stringify(eventPayload);
  const sigHeader = signatureHeaderOverride !== undefined ? signatureHeaderOverride : signPayload(rawBody, timestamp);

  const headers = { 'Content-Type': 'application/json' };
  if (sigHeader !== null) headers['stripe-signature'] = sigHeader;

  const res = await fetch(WEBHOOK_URL, { method: 'POST', headers, body: rawBody });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON response */ }
  return { status: res.status, json };
}

module.exports = {
  WEBHOOK_URL,
  signPayload,
  buildCheckoutCompletedEvent,
  postToStripeWebhook
};
