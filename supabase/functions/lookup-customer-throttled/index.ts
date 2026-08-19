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

// #35: front lookup_customer with a per-IP throttle so someone can't mass-guess
// emails to discover which addresses belong to real customers. Real booking
// flow only ever calls this 1-2 times, so a generous limit never touches a
// genuine customer.
const MAX_ATTEMPTS = 20;
const WINDOW_MINUTES = 15;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const { email, isTest } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400,
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

    // Test suite bypasses the throttle so the full Playwright run (32+ specs
    // that touch the booking modal, all from one IP) can't trip it. Unlike
    // send-email's isTest flag (which only skips a harmless side effect, the
    // Resend call — #45/session 71), skipping the throttle IS the security
    // control this function exists to add, so the client-supplied isTest flag
    // alone must never be enough to disable it: production never sets
    // TEST_BYPASS_ENABLED, so an attacker sending isTest:true against prod is
    // ignored and the real per-IP limit still applies. Only the TEST project's
    // function config carries this secret. Real throttling is proven by
    // sec-15-lookup-rate-limit.spec.js calling this function directly without isTest.
    const testBypassAllowed = Deno.env.get("TEST_BYPASS_ENABLED") === "true";
    if (!(isTest === true && testBypassAllowed)) {
      const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();

      const { data: allowed, error: throttleErr } = await adminClient.rpc(
        "check_lookup_rate_limit",
        { p_ip: ip, p_max_attempts: MAX_ATTEMPTS, p_window_minutes: WINDOW_MINUTES },
      );

      if (throttleErr) {
        console.error("check_lookup_rate_limit error:", throttleErr);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      if (allowed === false) {
        return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    const { data, error } = await adminClient.rpc("lookup_customer", { p_email: email });

    if (error) {
      console.error("lookup_customer error:", error);
      return new Response(JSON.stringify({ error: "Lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data: data ?? [] }), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("lookup-customer-throttled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
