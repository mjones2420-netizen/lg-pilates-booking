-- Migration 30 — #106: close the direct anon door on join_waitlist, and retire
-- migration 27's single-purpose limiter (part 2 of 2)
--
-- 1. The throttled Edge Function (join-waitlist-throttled) is worthless while
--    the raw RPC underneath it is still anon-callable — the #35 lesson. This
--    revokes it, so the Edge Function (service role) is the only public route
--    in. No admin path calls join_waitlist, so authenticated goes too.
--
-- 2. lookup-customer-throttled now uses migration 29's shared check_rate_limit,
--    so migration 27's lookup_rate_limits table, check_lookup_rate_limit RPC
--    and cleanup cron job have no caller left.
--
-- PRODUCTION ORDER: apply this LAST —
--   a. migration 29
--   b. deploy join-waitlist-throttled AND the updated lookup-customer-throttled
--   c. push index.html; confirm it is live on GitHub Pages
--   d. once the booking system has public users: wait about an hour —
--      visitors with the old page cached or still open call
--      sb.rpc('join_waitlist') directly, and after this revoke they get a
--      generic "Something went wrong" instead of joining. (First rolled out
--      before any customer used the system, so no wait was needed then.)
--   e. then this file
-- Applied before (b), the old lookup function would lose its RPC and every
-- booking's customer lookup would fail.

REVOKE EXECUTE ON FUNCTION public.join_waitlist(bigint, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_waitlist(bigint, text, text, text, text) TO service_role;

SELECT cron.unschedule('cleanup-lookup-rate-limits')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-lookup-rate-limits');

DROP FUNCTION IF EXISTS public.check_lookup_rate_limit(text, integer, integer);
DROP TABLE IF EXISTS public.lookup_rate_limits;
