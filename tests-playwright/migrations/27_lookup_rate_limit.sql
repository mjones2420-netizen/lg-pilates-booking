-- Migration 27 — #35: rate-limit the public lookup_customer path
--
-- lookup_customer is anon-callable (needed pre-login, to check if an email
-- has booked before) and only returns id+first_name since #47, but nothing
-- stopped someone calling it thousands of times with different emails to
-- discover which addresses belong to real customers. This adds a per-IP
-- throttle: a new table tracks attempt counts in a rolling window, checked
-- atomically (single UPSERT, avoids a race under concurrent requests from
-- the same IP — same "claim before acting" pattern as the #45 one-shot email
-- stamps) via a SECURITY DEFINER RPC callable only by service_role. The
-- actual lookup_customer grants are untouched — this sits in front of it,
-- called from a new Edge Function (lookup-customer-throttled), not from the
-- browser directly.
--
-- Apply to TEST (ngzfhamjuviwfwuncrjo) first, then PRODUCTION
-- (mrlooyixnlxzcfmvnqme) after the suite is green and Mark confirms.

CREATE TABLE public.lookup_rate_limits (
  ip text PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lookup_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies — zero rows visible via PostgREST/anon/authenticated. Only
-- service_role (used by the Edge Function) and the SECURITY DEFINER RPC
-- below can touch this table.
REVOKE ALL ON public.lookup_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lookup_rate_limits TO service_role;

-- =====================================================================
-- check_lookup_rate_limit — atomic claim-and-check, service_role only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_lookup_rate_limit(
  p_ip text, p_max_attempts integer, p_window_minutes integer)
  RETURNS boolean  -- true = allowed, false = over the limit
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO lookup_rate_limits (ip, attempt_count, window_start)
  VALUES (p_ip, 1, now())
  ON CONFLICT (ip) DO UPDATE SET
    attempt_count = CASE
      WHEN lookup_rate_limits.window_start < now() - (p_window_minutes || ' minutes')::interval
        THEN 1
      ELSE lookup_rate_limits.attempt_count + 1
    END,
    window_start = CASE
      WHEN lookup_rate_limits.window_start < now() - (p_window_minutes || ' minutes')::interval
        THEN now()
      ELSE lookup_rate_limits.window_start
    END
  RETURNING attempt_count INTO v_count;

  RETURN v_count <= p_max_attempts;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_lookup_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_lookup_rate_limit(text, integer, integer) TO service_role;

-- Close the direct-call bypass a code review caught: the throttled Edge
-- Function is worthless if the raw RPC underneath it is still anon-callable
-- (session note, #35 follow-up) — the browser's two lookup call sites and
-- ~28 test-spec call sites all switch to the Edge Function / a pg helper in
-- this same change, so no legitimate caller loses access.
REVOKE EXECUTE ON FUNCTION public.lookup_customer(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_customer(text) TO service_role;

-- Housekeeping — same pg_cron pattern as #49 (migration 23). Rows older than
-- 2 windows are stale (their limit has long since reset); daily sweep keeps
-- the table from growing forever. Idempotent: cron.schedule keys on jobname.
SELECT cron.schedule(
  'cleanup-lookup-rate-limits',
  '30 3 * * *',
  $$DELETE FROM public.lookup_rate_limits WHERE window_start < now() - interval '2 days'$$
);
