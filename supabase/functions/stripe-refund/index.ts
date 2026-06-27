// supabase/functions/stripe-refund/index.ts
// Issues a real Stripe refund for a cancellation row (T1-09b / issue #28).
//
// Called from the admin Cancellations report when "Mark Refunded" is clicked
// on a card-paid cancellation. The function:
//   1. Verifies the caller is a logged-in admin (authenticated JWT, not anon).
//   2. Loads the cancellation row server-side (service role, bypasses RLS).
//   3. Issues a Stripe refund for the stored refund_amount against the stored
//      payment intent, stamped with client + block metadata for identifiability.
//
// It does NOT flip the `refunded` flag — index.html does that only on success,
// so the report can never show "refunded" when no money actually moved.
//
// verify_jwt stays at the default (true): an Authorization bearer token is
// required. We additionally reject the anon key by confirming the token
// resolves to a real authenticated user.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://mjones2420-netizen.github.io",
  "https://book.lg-pilates.co.uk",
  "http://localhost:8000", // local dev + Playwright tests (#42)
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function json(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: "Server not configured" }, 500, req);
    }
    if (!stripeKey) {
      return json({ error: "Stripe not configured" }, 500, req);
    }

    // --- Auth gate: require a real authenticated admin ---
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return json({ error: "Unauthorized" }, 401, req);
    }
    const authClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401, req);
    }
    const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map(e => e.trim().toLowerCase());
    if (!adminEmails.includes((userData.user.email || "").toLowerCase())) {
      return json({ error: "Forbidden" }, 403, req);
    }

    // --- Input ---
    const { cancellation_id } = await req.json();
    if (!cancellation_id) {
      return json({ error: "Missing cancellation_id" }, 400, req);
    }

    // --- Load cancellation row server-side ---
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: row, error: rowErr } = await adminClient
      .from("cancellations")
      .select("id, first_name, last_name, refund_amount, refunded, stripe_payment_intent_id, block_start_date, block_end_date")
      .eq("id", cancellation_id)
      .single();

    if (rowErr || !row) {
      return json({ error: "Cancellation not found" }, 404, req);
    }
    if (row.refunded) {
      return json({ error: "Already refunded" }, 409, req);
    }
    if (!row.stripe_payment_intent_id) {
      return json({ error: "No payment intent on this cancellation" }, 400, req);
    }
    const amountPence = Math.round(Number(row.refund_amount) * 100);
    if (!(amountPence > 0)) {
      return json({ error: "Refund amount must be greater than zero" }, 400, req);
    }

    // --- Issue Stripe refund ---
    const clientName = `${row.first_name || ""} ${row.last_name || ""}`.trim();
    const blockDates = (row.block_start_date && row.block_end_date)
      ? `${row.block_start_date} to ${row.block_end_date}`
      : "";

    const stripeBody = new URLSearchParams({
      "payment_intent": row.stripe_payment_intent_id,
      "amount": String(amountPence),
      "metadata[client]": clientName,
      "metadata[block_dates]": blockDates,
      "metadata[cancellation_id]": String(row.id),
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: stripeBody.toString(),
    });

    const refund = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("Stripe refund error:", refund);
      return json({ error: refund.error?.message || "Stripe refund failed" }, 502, req);
    }

    return json({ refund_id: refund.id, status: refund.status, amount: amountPence }, 200, req);

  } catch (err) {
    console.error("stripe-refund error:", err);
    return json({ error: "Internal server error" }, 500, req);
  }
});
