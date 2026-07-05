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

// Server-side mirror of calcProrata() in index.html — recomputes the price
// from the block's own data so a tampered client-side amount can never be
// trusted (#32: stripe-checkout price tampering). Session dates are derived
// from start_date + i*7 days (#54: the reliable ISO source of truth), using
// local date parts (not toISOString) per the BST gotcha. This replaces the old
// heuristic that guessed a year from the display-string dates[] and mispriced
// any block spanning Dec into Jan.
function calcProrataPence(block: { price: number; weeks: number; dates: string[]; start_date: string }): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeks = block.weeks || (block.dates ? block.dates.length : 0);
  const fullPrice = block.price * weeks;
  const start = new Date(block.start_date + "T00:00:00");
  let remaining = 0;
  for (let i = 0; i < weeks; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i * 7);
    dt.setHours(0, 0, 0, 0);
    if (dt >= today) remaining++;
  }
  const isProrata = remaining < weeks && remaining > 0;
  const totalPrice = isProrata ? block.price * remaining : fullPrice;
  return Math.round(totalPrice * 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const {
      class_id, block_id,
      first_name, last_name, email, phone,
      customer_type, class_name,
      parq_data, success_url, cancel_url, is_test,
    } = await req.json();

    if (!class_id || !block_id || !first_name || !last_name || !email ||
        !class_name || !success_url || !cancel_url) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Recompute the price server-side from the block's own data — never trust
    // the client-supplied amount_pence (#32). Also confirms class_id/block_id
    // actually belong together.
    const { data: block, error: blockErr } = await adminClient
      .from("blocks")
      .select("price, weeks, dates, class_id, start_date")
      .eq("id", block_id)
      .single();

    if (blockErr || !block) {
      return new Response(JSON.stringify({ error: "Block not found" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (block.class_id !== class_id) {
      return new Response(JSON.stringify({ error: "Block does not belong to class" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const verifiedAmountPence = calcProrataPence(block);
    if (verifiedAmountPence <= 0) {
      return new Response(JSON.stringify({ error: "Invalid block price" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Insert pending_bookings row — holds booking intent until Stripe webhook confirms
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data: pendingRow, error: pendingErr } = await adminClient
      .from("pending_bookings")
      .insert({
        class_id, block_id,
        first_name, last_name, email, phone: phone || "",
        customer_type, amount_pence: verifiedAmountPence,
        parq_data: parq_data || null,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (pendingErr || !pendingRow) {
      console.error("pending_bookings insert failed:", pendingErr);
      return new Response(JSON.stringify({ error: "Failed to create pending booking" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Derive app base URL from success_url (used by webhook for dashboard link in admin email)
    const appBaseUrl = success_url.replace(/\?.*$/, "");

    // Create Stripe Checkout Session
    const stripeBody = new URLSearchParams({
      "payment_method_types[]": "card",
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][product_data][name]": `LG Pilates — ${class_name}`,
      "line_items[0][price_data][unit_amount]": String(verifiedAmountPence),
      "line_items[0][quantity]": "1",
      "mode": "payment",
      "success_url": success_url,
      "cancel_url": cancel_url,
      "metadata[pending_booking_id]": pendingRow.id,
      "metadata[is_test]": String(is_test === true),
      "metadata[app_base_url]": appBaseUrl,
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: stripeBody.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("Stripe error:", session);
      // Clean up pending row on Stripe failure
      await adminClient.from("pending_bookings").delete().eq("id", pendingRow.id);
      return new Response(JSON.stringify({ error: session.error?.message || "Stripe error" }), {
        status: 502,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("stripe-checkout error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
