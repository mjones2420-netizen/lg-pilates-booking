import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const PARQ_QUESTION_KEYS = [
  "q1_heart","q2_circulatory","q3_blood_pressure","q4_chest_pain","q5_joint",
  "q6_dizziness","q7_pregnant","q8_doctor_advised","q9_spinal","q10_medication",
  "q11_asthma","q12_other_reasons"
];

// --- Stripe signature verification (Deno-native, no Stripe SDK) ---
async function verifyStripeSignature(payload: string, sigHeader: string | null, secret: string): Promise<boolean> {
  if (!sigHeader) return false;
  const parts = sigHeader.split(",").reduce((acc: Record<string, string>, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts["t"];
  const sig = parts["v1"];
  if (!timestamp || !sig) return false;

  // Replay protection: reject events whose signed timestamp is outside a
  // 5-minute tolerance (Stripe's recommended default). Blocks an old, already
  // valid, captured event from being replayed later.
  const tsSeconds = parseInt(timestamp, 10);
  if (!Number.isFinite(tsSeconds)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

  // Constant-time-ish compare
  if (expected.length !== sig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== sig[i]) mismatch++;
  }
  return mismatch === 0;
}

// --- Escape customer-supplied fields before interpolating into email HTML ---
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Email HTML builder ---
// buildConfirmedEmailHtml and buildAdminAlertEmailHtml used to live here as
// hand-synced copies of the index.html / send-email versions (the drift that
// caused #39). They now live ONLY in the send-email function and are invoked
// via the typed calls below (confirmed_booking / card_payment_alert), #53.
// Only the payment-failed alert — which has no counterpart anywhere else —
// remains built inline here.
function buildPaymentFailedAdminEmailHtml(opts: {
  firstName: string; lastName: string; email: string; phone: string;
  className: string; venue: string; loc: string; day: string; time: string; endTime: string;
  amountDue: number; reason: string; pendingId: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">`
    + `<tr><td align="center">`
    + `<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">`
    + `<tr><td style="background:#1a2e2e;padding:28px 32px;text-align:center;">`
    + `<div style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px;">LG <span style="color:#b8d8d8;font-style:italic;">Pilates</span></div>`
    + `<div style="color:#8aabab;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `<tr><td style="background:#fdeaea;border-left:4px solid #c04040;padding:18px 32px;">`
    + `<div style="font-size:15px;font-weight:600;color:#8a2a2a;margin-bottom:6px;">Action needed: payment taken, booking not placed</div>`
    + `<div style="font-size:13px;color:#7a2a2a;line-height:1.6;">${esc(opts.firstName)} ${esc(opts.lastName)} paid for a class but their booking could not be created (${opts.reason === "ALREADY_BOOKED" ? "they already have a booking on this block" : "the class is now full"}). This needs manual follow-up &mdash; likely a refund and a message to the client.</div>`
    + `</td></tr>`
    + `<tr><td style="padding:24px 32px;">`
    + `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">Details</div>`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f5;border-radius:6px;padding:16px 20px;margin-bottom:20px;">`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Client</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${esc(opts.firstName)} ${esc(opts.lastName)}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Email</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${esc(opts.email)}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Phone</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${esc(opts.phone)}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Class</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.className}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Venue</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.venue}, ${opts.loc}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Day &amp; time</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.day}, ${opts.time} &ndash; ${opts.endTime}</td></tr>`
    + `<tr><td style="padding:6px 0;font-size:13px;color:#4a6060;">Amount paid</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">&pound;${opts.amountDue}</td></tr>`
    + `</table>`
    + `<p style="font-size:13px;color:#4a6060;line-height:1.7;margin:0;">Stripe has taken payment for this booking, but it could not be added to the schedule. Please contact the client and arrange a refund via the Stripe dashboard if appropriate. Reference: <span style="font-family:monospace;">${opts.pendingId}</span></p>`
    + `</td></tr>`
    + `<tr><td style="background:#eef5f5;padding:16px 32px;text-align:center;">`
    + `<div style="font-size:11px;color:#8aabab;line-height:1.6;">LG Pilates &middot; Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

// Customer-facing email when payment succeeded but the booking could not be
// placed (#6b — CLASS_FULL / ALREADY_BOOKED after payment). Mirrors the on-screen
// "payment received, place not secured" message (#6a). The recipient is
// server-derived (the pending row's own email) so this stays off the send-email
// open-relay path (#33); the name is esc()'d (#39). Single copy, no counterpart
// elsewhere — like buildPaymentFailedAdminEmailHtml it is built inline here.
function buildPaymentFailedClientEmailHtml(opts: {
  firstName: string; className: string; day: string; time: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">`
    + `<tr><td align="center">`
    + `<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">`
    + `<tr><td style="background:#1a2e2e;padding:28px 32px;text-align:center;">`
    + `<div style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px;">LG <span style="color:#b8d8d8;font-style:italic;">Pilates</span></div>`
    + `<div style="color:#8aabab;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `<tr><td style="background:#fbf1e3;border-left:4px solid #c9821f;padding:18px 32px;">`
    + `<div style="font-size:15px;font-weight:600;color:#8a5a12;margin-bottom:6px;">Payment received &mdash; but we couldn&rsquo;t secure your place</div>`
    + `<div style="font-size:13px;color:#7a5a2a;line-height:1.6;">Hi ${esc(opts.firstName)}, your payment went through, but ${esc(opts.className)} (${esc(opts.day)}, ${esc(opts.time)}) filled up in the moments while you were paying, so we couldn&rsquo;t hold your spot.</div>`
    + `</td></tr>`
    + `<tr><td style="padding:24px 32px;">`
    + `<p style="font-size:14px;color:#4a6060;line-height:1.7;margin:0 0 14px;">Louise has been notified automatically and will be in touch to arrange a <strong>full refund</strong> or offer you an alternative class. <strong>You don&rsquo;t need to do anything.</strong></p>`
    + `<p style="font-size:14px;color:#4a6060;line-height:1.7;margin:0;">We&rsquo;re sorry for the inconvenience &mdash; classes occasionally fill in the last few seconds before payment completes.</p>`
    + `</td></tr>`
    + `<tr><td style="background:#eef5f5;padding:16px 32px;text-align:center;">`
    + `<div style="font-size:11px;color:#8aabab;line-height:1.6;">LG Pilates &middot; Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

// Internal server-to-server call to the send-email function. Authenticates with
// the service-role key (NOT the public anon key) so send-email trusts it as an
// internal caller after the #33 open-relay hardening.
async function sendEmail(supabaseUrl: string, authKey: string, to: string, subject: string, html: string, isTest: boolean) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authKey}` },
      body: JSON.stringify({ to, subject, html, isTest }),
    });
    if (!res.ok) {
      console.warn("send-email failed (non-fatal):", res.status, await res.text());
    }
  } catch (e) {
    console.warn("send-email error (non-fatal):", e);
  }
}

// Typed server-built email (confirmed_booking / card_payment_alert). send-email
// loads the recipient and builds the HTML itself from the booking id — the
// single source of truth for these templates (#53). Authenticated with the
// service-role key (internal caller).
async function sendTypedEmail(supabaseUrl: string, authKey: string, type: string, bookingId: string, isTest: boolean) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authKey}` },
      body: JSON.stringify({ type, booking_id: bookingId, isTest }),
    });
    if (!res.ok) {
      console.warn("send-email (typed) failed (non-fatal):", type, res.status, await res.text());
    }
  } catch (e) {
    console.warn("send-email (typed) error (non-fatal):", type, e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const rawBody = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sigHeader = req.headers.get("stripe-signature");

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const validSig = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!validSig) {
    console.error("Invalid Stripe signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only act on successful checkout completion
  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const session = event.data?.object;
  const metadata = session?.metadata || {};
  const pendingId = metadata.pending_booking_id;
  const isTest = metadata.is_test === "true";

  if (!pendingId) {
    console.error("checkout.session.completed with no pending_booking_id metadata");
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch the pending booking
    const { data: pending, error: pendingErr } = await adminClient
      .from("pending_bookings")
      .select("*")
      .eq("id", pendingId)
      .single();

    if (pendingErr || !pending) {
      // Already processed (e.g. duplicate webhook delivery) or expired/cleaned up — treat as success
      console.warn("pending_bookings row not found (likely already processed):", pendingId);
      return new Response(JSON.stringify({ received: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert customer
    const { data: customerId, error: custErr } = await adminClient.rpc("upsert_customer", {
      p_first_name: pending.first_name,
      p_last_name: pending.last_name,
      p_email: pending.email,
      p_phone: pending.phone,
      p_customer_type: pending.customer_type,
    });
    if (custErr) throw new Error(`upsert_customer failed: ${custErr.message}`);

    // Create the real booking
    const amountDue = pending.amount_pence / 100;
    const { data: bookingId, error: bookErr } = await adminClient.rpc("book_if_available", {
      p_block_id: pending.block_id,
      p_class_id: pending.class_id,
      p_customer_id: customerId,
      p_amount_due: amountDue,
    });

    if (bookErr) {
      // CLASS_FULL or ALREADY_BOOKED — payment succeeded but booking couldn't be placed.
      // Leave the pending row for manual review by Louise/Mark, and alert the admin by email.
      const msg = bookErr.message || "";
      const reason = msg.indexOf("ALREADY_BOOKED") > -1 ? "ALREADY_BOOKED" : "CLASS_FULL";
      console.error("book_if_available failed after payment:", msg, "pending_id:", pendingId);

      try {
        const { data: cls } = await adminClient.from("classes").select("*").eq("id", pending.class_id).single();
        const { data: settingsRows } = await adminClient.from("settings").select("key,value").eq("key", "admin_email");
        const adminEmail = settingsRows && settingsRows[0] ? settingsRows[0].value : null;

        if (cls) {
          // Client-facing (#6b): tell the customer their payment took but the
          // place wasn't secured. Sends even if admin_email is unset, and each
          // send is independently non-fatal so one failure can't block the other.
          try {
            const clientHtml = buildPaymentFailedClientEmailHtml({
              firstName: pending.first_name,
              className: cls.name,
              day: cls.day,
              time: cls.time,
            });
            await sendEmail(supabaseUrl, supabaseServiceKey, pending.email,
              "About your LG Pilates payment", clientHtml, isTest);
          } catch (e) {
            console.warn("Failed to send payment-failed client email (non-fatal):", e);
          }

          // Admin alert (unchanged) — needs admin_email configured.
          if (adminEmail) {
            const failHtml = buildPaymentFailedAdminEmailHtml({
              firstName: pending.first_name,
              lastName: pending.last_name,
              email: pending.email,
              phone: pending.phone,
              className: cls.name,
              venue: cls.venue,
              loc: cls.loc,
              day: cls.day,
              time: cls.time,
              endTime: cls.end_time,
              amountDue: amountDue,
              reason: reason,
              pendingId: pendingId,
            });
            await sendEmail(supabaseUrl, supabaseServiceKey, adminEmail,
              `Action needed — payment taken but booking failed (${pending.first_name} ${pending.last_name})`,
              failHtml, isTest);
          }
        }
      } catch (e) {
        console.warn("Failed to send payment-failed emails (non-fatal):", e);
      }

      return new Response(JSON.stringify({ received: true, warning: "booking_failed_after_payment" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stripe records the booking as confirmed (payment already taken)
    await adminClient.from("bookings").update({
      status: "confirmed",
      stripe_payment_intent_id: session.payment_intent || null,
      stripe_checkout_session_id: session.id || null,
    }).eq("id", bookingId);

    // Save PAR-Q for new clients (non-fatal if it fails)
    if (pending.customer_type === "new" && pending.parq_data) {
      try {
        const p = pending.parq_data;
        const parqRow: Record<string, any> = {
          booking_id: bookingId,
          customer_id: customerId,
          age: p.age,
          emergency_name: p.emergency_name,
          emergency_relationship: p.emergency_relationship,
          emergency_phone: p.emergency_phone,
          yes_details: p.yes_details,
          additional_notes: p.additional_notes,
          print_name: p.print_name,
          sign_date: p.sign_date,
        };
        if (p.answers) {
          for (const key of PARQ_QUESTION_KEYS) {
            if (key in p.answers) parqRow[key] = p.answers[key];
          }
        }
        const { error: parqErr } = await adminClient.from("parq").insert(parqRow);
        if (parqErr) console.warn("PAR-Q insert failed (non-fatal):", parqErr.message);
      } catch (e) {
        console.warn("PAR-Q insert error (non-fatal):", e);
      }
    }

    // Delete the pending row now — AFTER the booking is confirmed and PAR-Q
    // saved (so the critical state is persisted before we drop the idempotency
    // key), but BEFORE the slower email sends. A duplicate/retried delivery of
    // the same event then finds no pending row and takes the "already
    // processed" early return above, instead of racing into book_if_available,
    // hitting ALREADY_BOOKED, and misfiring the "payment taken, booking failed"
    // alarm. All data needed for the emails (pending.*, class/block) is already
    // loaded / about to be fetched by id, so it doesn't depend on this row.
    await adminClient.from("pending_bookings").delete().eq("id", pendingId);

    // Trigger 2 (client confirmation) + Trigger 5S (admin card-payment alert).
    // Both are built server-side by send-email from the booking id — recipient,
    // amount, and template all resolved there (single source of truth, #53).
    // send-email skips the admin alert itself if no admin_email is configured.
    await sendTypedEmail(supabaseUrl, supabaseServiceKey, "confirmed_booking", bookingId, isTest);
    await sendTypedEmail(supabaseUrl, supabaseServiceKey, "card_payment_alert", bookingId, isTest);

    return new Response(JSON.stringify({ received: true, booking_id: bookingId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("stripe-webhook error:", err);
    // Return 500 so Stripe retries the webhook
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
