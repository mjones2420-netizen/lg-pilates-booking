import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { json, preflight, getAdminClient, checkThrottle } from "../_shared/throttle.ts";

// #35: front lookup_customer with a per-IP throttle so someone can't mass-guess
// emails to discover which addresses belong to real customers. Real booking
// flow only ever calls this 1-2 times, so a generous limit never touches a
// genuine customer.
const MAX_ATTEMPTS = 20;
const WINDOW_MINUTES = 15;

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { email, isTest } = await req.json();

    if (!email || typeof email !== "string") {
      return json(req, 400, { error: "Missing email" });
    }

    const adminClient = getAdminClient();
    if (!adminClient) return json(req, 500, { error: "Server not configured" });

    // Real throttling is proven by sec-15-lookup-rate-limit.spec.js calling
    // this without isTest.
    const throttle = await checkThrottle(req, adminClient, {
      bucket: "lookup", maxAttempts: MAX_ATTEMPTS, windowMinutes: WINDOW_MINUTES, isTest,
    });
    if (throttle === "error") return json(req, 500, { error: "Internal server error" });
    if (throttle === "limited") {
      return json(req, 429, { error: "Too many attempts. Please try again later." });
    }

    const { data, error } = await adminClient.rpc("lookup_customer", { p_email: email });

    if (error) {
      console.error("lookup_customer error:", error);
      return json(req, 500, { error: "Lookup failed" });
    }

    // needsHealthForm: must this person still be asked the PAR-Q?
    //
    // The booking form used to infer "we already have your health details"
    // from "does a customer row exist", which held only because a row was
    // created at the moment of booking. join_waitlist (#72) creates one when
    // someone joins a queue, so that inference silently skips the PAR-Q for a
    // genuine first-timer, and keeps skipping it on every later booking.
    //
    // Neither available signal is sufficient alone:
    //   customer_type   — flips to 'returning' only on a SECOND booking, so a
    //                     real client who has booked once still reads 'new'.
    //   a parq row      — plenty of legitimate 'returning' clients have none
    //                     (added by hand, or booked before the form existed).
    // Either one is enough to skip; only someone with neither gets asked.
    //
    // Answered here rather than by a new public RPC so it stays behind the
    // throttle above, and returned as a bare boolean rather than the raw
    // customer_type so nothing #47 trimmed from lookup_customer comes back.
    let needsHealthForm = true;
    const customerId = Array.isArray(data) && data.length > 0 ? data[0].id : null;
    if (customerId != null) {
      const [custRes, parqRes] = await Promise.all([
        adminClient.from("customers").select("customer_type").eq("id", customerId).maybeSingle(),
        adminClient.from("parq").select("id").eq("customer_id", customerId).limit(1),
      ]);

      if (custRes.error || parqRes.error) {
        // Fail closed: an unknown answer must mean "ask the health questions",
        // never "skip them".
        console.error("needsHealthForm lookup error:", custRes.error ?? parqRes.error);
      } else {
        const type = custRes.data?.customer_type ?? null;
        // 'vip' is a valid customer_type (migration 01) and means an
        // established client, so it skips alongside 'returning'.
        const knownClient = type === "returning" || type === "vip";
        const hasParq = Array.isArray(parqRes.data) && parqRes.data.length > 0;
        needsHealthForm = !knownClient && !hasParq;
      }
    }

    return json(req, 200, { data: data ?? [], needsHealthForm });

  } catch (err) {
    console.error("lookup-customer-throttled error:", err);
    return json(req, 500, { error: "Internal server error" });
  }
});
