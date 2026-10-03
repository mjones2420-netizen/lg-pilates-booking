import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { json, preflight, getAdminClient, checkThrottle } from "../_shared/throttle.ts";

// #110: a join is now a REQUEST. request_waitlist_join stores it, and this
// function emails the joiner a confirmation link (send-email,
// waitlist_confirm). Nothing reaches the real waiting list — no seat held,
// nothing on Louise's page — until the email owner clicks the link
// (confirm_waitlist_request, called from the booking page). Submitting the
// same details again is a resend of the same request, capped in the DB.
//
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
// only public way in, so a direct caller must not get past them:
// request_waitlist_join itself only checks block + email, and a new customer
// is later created from these exact details when the link is clicked.
function validationError(f: { firstName: string; lastName: string; email: string; phone: string }): string | null {
  if (!f.firstName || !f.lastName || !f.email || !f.phone) return "WL_MISSING_FIELDS";
  const phoneDigits = f.phone.replace(/[\s\-\+\(\)]/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return "WL_INVALID_FIELDS";
  if (!(phoneDigits.length >= 11 && /^\d+$/.test(phoneDigits))) return "WL_INVALID_FIELDS";
  return null;
}

// Internal server-to-server call to send-email with the service-role key
// (its trusted path). Non-fatal: the request is saved either way, and the
// customer can press "Resend the email". Returns whether it went.
async function sendConfirmEmail(requestId: number, appUrl: unknown, isTest: boolean): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ type: "waitlist_confirm", waitlist_request_id: requestId, app_url: appUrl, isTest }),
    });
    if (!res.ok) {
      console.warn("waitlist_confirm email failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.warn("waitlist_confirm email error:", e);
    return false;
  }
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

    const { data, error } = await adminClient.rpc("request_waitlist_join", {
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
      console.error("request_waitlist_join error:", error);
      return json(req, 500, { error: "Join failed" });
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return json(req, 500, { error: "Join failed" });

    // The confirmation link carries the request's token, so it is built and
    // sent entirely server-side: the browser only ever learns the request id.
    const emailed = await sendConfirmEmail(row.request_id, body.app_url, body.isTest === true);

    // Practice copy only (Training Hub lesson 1.5): the test project never
    // sends email, so Louise could never click the link. There — and only
    // there — the token is handed back so the page can show a "practice copy"
    // button. Gated on the same server-side secret as the isTest bypass, which
    // production never has, so a caller asking for it on prod gets nothing.
    let practice_token: string | null = null;
    if (body.practiceLink === true && body.isTest === true && Deno.env.get("TEST_BYPASS_ENABLED") === "true") {
      const { data: tok } = await adminClient
        .from("waitlist_requests").select("token").eq("id", row.request_id).single();
      practice_token = tok?.token ?? null;
    }

    return json(req, 200, {
      data: { request_id: row.request_id, is_resend: row.is_resend, emailed, ...(practice_token ? { practice_token } : {}) },
    });

  } catch (err) {
    console.error("join-waitlist-throttled error:", err);
    return json(req, 500, { error: "Internal server error" });
  }
});
