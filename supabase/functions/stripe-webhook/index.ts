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

// --- Email HTML builders (mirrors index.html buildConfirmedEmailHtml / buildAdminAlertEmailHtml) ---
function buildConfirmedEmailHtml(opts: {
  firstName: string; className: string; venue: string; loc: string;
  day: string; time: string; endTime: string; blockDates: string[];
}): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const months: Record<string, number> = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const pillsHtml = (opts.blockDates || []).map((d) => {
    const parts = d.split(" ");
    const dt = new Date(new Date().getFullYear(), months[parts[1]] || 0, parseInt(parts[0]) || 1);
    const past = dt < today;
    return past
      ? `<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#f0f0f0;color:#aaaaaa;border:1px solid #dddddd;">${d}</span>`
      : `<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#eef5f5;color:#2a6b6b;border:1px solid #cde0e0;">${d}</span>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">`
    + `<tr><td align="center">`
    + `<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">`
    + `<tr><td style="background:#1a2e2e;padding:28px 32px;text-align:center;">`
    + `<div style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px;">LG <span style="color:#b8d8d8;font-style:italic;">Pilates</span></div>`
    + `<div style="color:#8aabab;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `<tr><td style="background:#e8f5e8;border-left:4px solid #3a8a6a;padding:18px 32px;">`
    + `<div style="font-size:15px;font-weight:600;color:#2a6a4a;margin-bottom:6px;">Booking confirmed</div>`
    + `<div style="font-size:13px;color:#2a5a3a;line-height:1.6;">Payment received, your booking is now confirmed. We look forward to seeing you.</div>`
    + `</td></tr>`
    + `<tr><td style="padding:24px 32px;">`
    + `<p style="font-size:15px;margin:0 0 16px;color:#1a2e2e;">Hi ${esc(opts.firstName)},</p>`
    + `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">Your booking</div>`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f5;border-radius:6px;padding:16px 20px;margin-bottom:20px;">`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Class</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.className}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Venue</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.venue}, ${opts.loc}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Day &amp; time</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.day}, ${opts.time} &ndash; ${opts.endTime}</td></tr>`
    + (pillsHtml ? `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;vertical-align:top;padding-top:8px;">Sessions</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;text-align:right;">${pillsHtml}</td></tr>` : "")
    + `</table>`
    + `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">What to bring</div>`
    + `<p style="font-size:13px;color:#4a6060;line-height:1.7;margin:0 0 20px;">Please wear comfortable clothing and bring a water bottle. Please arrive no more than 10 minutes before the session starts.</p>`
    + `</td></tr>`
    + `<tr><td style="background:#eef5f5;padding:16px 32px;text-align:center;">`
    + `<div style="font-size:11px;color:#8aabab;line-height:1.6;">Questions? Reply to this email or contact Louise at <a href="mailto:bookings@lg-pilates.co.uk" style="color:#3a8a8a;text-decoration:none;">bookings@lg-pilates.co.uk</a><br>LG Pilates &middot; Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

function buildAdminAlertEmailHtml(opts: {
  firstName: string; lastName: string; className: string; venue: string; loc: string;
  day: string; time: string; endTime: string; blockDates: string[];
  amountDue: number; customerType: string; dashboardUrl: string;
}): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isNew = opts.customerType === "new";
  const months: Record<string, number> = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const pillsHtml = (opts.blockDates || []).map((d) => {
    const parts = d.split(" ");
    const dt = new Date(new Date().getFullYear(), months[parts[1]] || 0, parseInt(parts[0]) || 1);
    const past = dt < today;
    return past
      ? `<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#f0f0f0;color:#aaaaaa;border:1px solid #dddddd;">${d}</span>`
      : `<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#eef5f5;color:#2a6b6b;border:1px solid #cde0e0;">${d}</span>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">`
    + `<tr><td align="center">`
    + `<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">`
    + `<tr><td style="background:#1a2e2e;padding:28px 32px;text-align:center;">`
    + `<div style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px;">LG <span style="color:#b8d8d8;font-style:italic;">Pilates</span></div>`
    + `<div style="color:#8aabab;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `<tr><td style="background:#e8f0fb;border-left:4px solid #3a6abf;padding:18px 32px;">`
    + `<div style="font-size:15px;font-weight:600;color:#1a3a7a;margin-bottom:6px;">New booking</div>`
    + `<div style="font-size:13px;color:#2a4a8a;line-height:1.6;">${esc(opts.firstName)} ${esc(opts.lastName)} (${isNew ? "New client" : "Returning client"}) has made a new booking via card payment.</div>`
    + `</td></tr>`
    + `<tr><td style="padding:24px 32px;">`
    + `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">Booking details</div>`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f5;border-radius:6px;padding:16px 20px;margin-bottom:20px;">`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Client</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${esc(opts.firstName)} ${esc(opts.lastName)}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Class</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.className}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Venue</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.venue}, ${opts.loc}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Day &amp; time</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.day}, ${opts.time} &ndash; ${opts.endTime}</td></tr>`
    + (pillsHtml ? `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;vertical-align:top;padding-top:8px;">Sessions</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;text-align:right;">${pillsHtml}</td></tr>` : "")
    + `<tr><td style="padding:6px 0;font-size:13px;color:#4a6060;">Amount paid</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">&pound;${opts.amountDue}</td></tr>`
    + `</table>`
    + (isNew ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e8;border-left:4px solid #e07b4a;border-radius:0 6px 6px 0;margin-bottom:20px;">`
      + `<tr><td style="padding:14px 18px;font-size:13px;color:#7a4010;">&#9888;&nbsp; A PAR-Q health form has been submitted with this booking. You can view it in the dashboard.</td></tr>`
      + `</table>` : "")
    + (opts.dashboardUrl ? `<p style="font-size:13px;color:#4a6060;margin:0 0 8px;"><a href="${opts.dashboardUrl}" style="color:#3a8a8a;font-weight:600;text-decoration:none;">View full details in the dashboard &rarr;</a></p>` : "")
    + `</td></tr>`
    + `<tr><td style="background:#eef5f5;padding:16px 32px;text-align:center;">`
    + `<div style="font-size:11px;color:#8aabab;line-height:1.6;">LG Pilates &middot; Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

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
  const appBaseUrl = metadata.app_base_url || "";

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

        if (adminEmail && cls) {
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
      } catch (e) {
        console.warn("Failed to send payment-failed admin alert (non-fatal):", e);
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

    // Fetch class + block details for the emails
    const { data: cls } = await adminClient.from("classes").select("*").eq("id", pending.class_id).single();
    const { data: blk } = await adminClient.from("blocks").select("*").eq("id", pending.block_id).single();

    if (cls && blk) {
      // Trigger 2: client confirmation email
      const clientHtml = buildConfirmedEmailHtml({
        firstName: pending.first_name,
        className: cls.name,
        venue: cls.venue,
        loc: cls.loc,
        day: cls.day,
        time: cls.time,
        endTime: cls.end_time,
        blockDates: blk.dates || [],
      });
      await sendEmail(supabaseUrl, supabaseServiceKey, pending.email,
        `Your LG Pilates booking is confirmed — ${cls.name}`, clientHtml, isTest);

      // Trigger 5S: admin payment alert email
      const { data: settingsRows } = await adminClient.from("settings").select("key,value").eq("key", "admin_email");
      const adminEmail = settingsRows && settingsRows[0] ? settingsRows[0].value : null;

      if (adminEmail) {
        const dashboardUrl = appBaseUrl ? `${appBaseUrl}#dashboard` : "";
        const adminHtml = buildAdminAlertEmailHtml({
          firstName: pending.first_name,
          lastName: pending.last_name,
          className: cls.name,
          venue: cls.venue,
          loc: cls.loc,
          day: cls.day,
          time: cls.time,
          endTime: cls.end_time,
          blockDates: blk.dates || [],
          amountDue: amountDue,
          customerType: pending.customer_type,
          dashboardUrl: dashboardUrl,
        });
        await sendEmail(supabaseUrl, supabaseServiceKey, adminEmail,
          `New booking (card payment) — ${pending.first_name} ${pending.last_name}, ${cls.day} ${cls.time}, ${cls.venue}`,
          adminHtml, isTest);
      }
    }

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
