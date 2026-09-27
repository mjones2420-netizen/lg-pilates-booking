import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { json, preflight, getAdminClient, checkThrottle } from "../_shared/throttle.ts";

// #106: front join_waitlist with a per-IP throttle. Every waitlist row takes a
// seat off public sale (migration 28's reservation rule) and emails Louise, so
// an unthrottled loop of fake emails could lock a class out of public booking.
// Every attempt counts, refusals included, and mobile carriers put many
// customers behind one shared IP — so 10 an hour leaves room for a few real
// people on one network. WL_LIST_FULL still caps any one list at the class size.
const MAX_ATTEMPTS = 10;
const WINDOW_MINUTES = 60;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// The same rules submitWaitlist applies in the browser. This function is the
// only public way in, so a direct caller must not get past them: join_waitlist
// itself only checks block + email, and upsert_customer writes the phone onto
// an existing customer's row.
function validationError(f: { firstName: string; lastName: string; email: string; phone: string }): string | null {
  if (!f.firstName || !f.lastName || !f.email || !f.phone) return "WL_MISSING_FIELDS";
  const phoneDigits = f.phone.replace(/[\s\-\+\(\)]/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return "WL_INVALID_FIELDS";
  if (!(phoneDigits.length >= 11 && /^\d+$/.test(phoneDigits))) return "WL_INVALID_FIELDS";
  return null;
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const body = await req.json();

    const adminClient = getAdminClient();
    if (!adminClient) return json(req, 500, { error: "Server not configured" });

    // Throttle before validating, so malformed attempts spend budget too.
    // Real throttling is proven by sec-16-waitlist-join-rate-limit.spec.js
    // calling this without isTest.
    const throttle = await checkThrottle(req, adminClient, {
      bucket: "waitlist_join", maxAttempts: MAX_ATTEMPTS, windowMinutes: WINDOW_MINUTES, isTest: body.isTest,
    });
    if (throttle === "error") return json(req, 500, { error: "Internal server error" });
    if (throttle === "limited") return json(req, 429, { error: "WL_RATE_LIMITED" });

    const fields = {
      firstName: str(body.firstName), lastName: str(body.lastName),
      email: str(body.email), phone: str(body.phone),
    };
    const invalid = body.blockId == null ? "WL_MISSING_FIELDS" : validationError(fields);
    if (invalid) return json(req, 400, { error: invalid });

    const { data, error } = await adminClient.rpc("join_waitlist", {
      p_block_id: body.blockId,
      p_first_name: fields.firstName,
      p_last_name: fields.lastName,
      p_email: fields.email,
      p_phone: fields.phone,
    });

    if (error) {
      // Pass the coded WL_* refusals through so the browser can show its
      // plain-English message; anything else stays generic rather than
      // leaking database detail to the public.
      const code = (error.message ?? "").match(/WL_[A-Z_]+/);
      if (code) return json(req, 400, { error: code[0] });
      console.error("join_waitlist error:", error);
      return json(req, 500, { error: "Join failed" });
    }

    return json(req, 200, { data: data ?? [] });

  } catch (err) {
    console.error("join-waitlist-throttled error:", err);
    return json(req, 500, { error: "Internal server error" });
  }
});
