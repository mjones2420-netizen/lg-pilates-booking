-- Migration 29 — #106: one shared per-IP rate limiter (part 1 of 2)
--
-- join_waitlist is anon-callable with no throttle. Under the reservation rule
-- (migration 28) every waitlist row takes a seat off public sale, so a loop of
-- fake emails can lock a class out of public booking — and each join fires a
-- waitlist_joined_alert to Louise, burning the Resend quota. WL_LIST_FULL
-- bounds the damage per block but does not prevent it.
--
-- #35 (migration 27) solved the same problem for lookup_customer with its own
-- table + RPC + cron job. Rather than clone that per endpoint, this adds one
-- generic limiter keyed by (bucket, ip): each throttled Edge Function passes
-- its own bucket name ('lookup', 'waitlist_join'), so the limits stay separate
-- — a booking's lookups never eat into someone's join budget — with a single
-- mechanism. Migration 30 retires migration 27's table, RPC and cron job once
-- lookup-customer-throttled has moved over.
--
-- This file is SAFE to apply to production before anything else: it only
-- adds. Migration 30 must land on production LAST — see its header.
--
-- Apply to TEST (ngzfhamjuviwfwuncrjo) first, then PRODUCTION
-- (mrlooyixnlxzcfmvnqme) after the suite is green and Mark confirms.

CREATE TABLE public.rate_limits (
  bucket text NOT NULL,
  ip text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, ip)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies — invisible to anon/authenticated via PostgREST. Only
-- service_role (the Edge Functions) and the SECURITY DEFINER RPC below.
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;

-- =====================================================================
-- check_rate_limit — atomic claim-and-check, service_role only
-- =====================================================================
-- Single UPSERT so concurrent requests from one IP can't race past the limit
-- (same "claim before acting" pattern as the #45 one-shot email stamps).
-- Fixed window: the count resets once the window has fully elapsed.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket text, p_ip text, p_max_attempts integer, p_window_minutes integer)
  RETURNS boolean  -- true = allowed, false = over the limit
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO rate_limits (bucket, ip, attempt_count, window_start)
  VALUES (p_bucket, p_ip, 1, now())
  ON CONFLICT (bucket, ip) DO UPDATE SET
    attempt_count = CASE
      WHEN rate_limits.window_start < now() - (p_window_minutes || ' minutes')::interval
        THEN 1
      ELSE rate_limits.attempt_count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < now() - (p_window_minutes || ' minutes')::interval
        THEN now()
      ELSE rate_limits.window_start
    END
  RETURNING attempt_count INTO v_count;

  RETURN v_count <= p_max_attempts;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO service_role;

-- Housekeeping — same pg_cron pattern as #49 (migration 23). Rows older than
-- 2 days are stale (every bucket's window is far shorter). Idempotent:
-- cron.schedule keys on jobname.
SELECT cron.schedule(
  'cleanup-rate-limits',
  '30 3 * * *',
  $$DELETE FROM public.rate_limits WHERE window_start < now() - interval '2 days'$$
);
