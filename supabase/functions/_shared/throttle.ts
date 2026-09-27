// Shared by the public, pre-login Edge Functions that sit in front of an
// anon-reachable RPC with a per-IP throttle (#35 lookup-customer-throttled,
// #106 join-waitlist-throttled). One copy of the CORS allowlist, the request
// boilerplate and the throttle rules, so the Phase 1.5 move to
// book.lg-pilates.co.uk — or any fix to how the caller's IP is read — lands in
// every function at once.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://mjones2420-netizen.github.io",
  "https://book.lg-pilates.co.uk",
  "http://localhost:8000", // local dev + Playwright tests (#42)
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

// CORS preflight answer, or null when this isn't a preflight.
export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders(req) }) : null;
}

// Service-role client, or null when the function's env is missing its secrets.
export function getAdminClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? createClient(url, key) : null;
}

// Supabase's gateway sets X-Forwarded-For itself and discards any value the
// caller sends — verified on test (session 99): requests carrying invented
// addresses all landed in the real IP's bucket — so the first entry is
// trustworthy. SEC-16d pins this.
function clientIp(req: Request): string | null {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return first || null;
}

// The key an address is counted under. IPv4 as-is. IPv6 by its /64 prefix:
// one ordinary connection (a home line, any VPS) owns a whole /64, so keying
// on the full address would hand an attacker a fresh budget per address.
export function throttleKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) is really an IPv4 caller.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  const prefix = groups.slice(0, 4).map((g) => (g.toLowerCase().replace(/^0+(?=.)/, "") || "0"));
  return prefix.join(":") + "::/64";
}

// Callers whose IP can't be read share one bucket with a ceiling this many
// times the per-IP limit — high enough that real visitors aren't locked out if
// a platform change ever strips the header, but still a ceiling, so a missing
// header can never mean "no throttle at all".
const UNKNOWN_IP_MULTIPLIER = 10;

export type ThrottleResult = "allowed" | "limited" | "error";

// Claims one attempt against (bucket, caller) and says whether to proceed.
//
// isTest bypass: the suite runs every spec from one IP, so it passes
// isTest:true. That flag alone must never disable the throttle — it IS the
// security control — so it only counts where this project's
// TEST_BYPASS_ENABLED secret is set, which production never has.
export async function checkThrottle(
  req: Request,
  adminClient: SupabaseClient,
  opts: { bucket: string; maxAttempts: number; windowMinutes: number; isTest: unknown },
): Promise<ThrottleResult> {
  const testBypassAllowed = Deno.env.get("TEST_BYPASS_ENABLED") === "true";
  if (opts.isTest === true && testBypassAllowed) return "allowed";

  const ip = clientIp(req);
  let key: string;
  let max = opts.maxAttempts;
  if (ip === null) {
    console.error(`${opts.bucket}: no caller IP — counting against the shared 'unknown' bucket`);
    key = "unknown";
    max = opts.maxAttempts * UNKNOWN_IP_MULTIPLIER;
  } else {
    key = throttleKey(ip);
  }

  const { data: allowed, error } = await adminClient.rpc("check_rate_limit", {
    p_bucket: opts.bucket,
    p_ip: key,
    p_max_attempts: max,
    p_window_minutes: opts.windowMinutes,
  });

  if (error) {
    console.error("check_rate_limit error:", error);
    return "error";
  }
  return allowed === false ? "limited" : "allowed";
}
