-- Migration 23: Scheduled cleanup of expired pending_bookings (#49)
--
-- PRIVACY / GDPR: when a customer starts a card payment their details — including
-- a full PAR-Q health questionnaire if they are new — are parked in
-- pending_bookings until the Stripe webhook confirms payment. If they abandon the
-- payment, that row (personal + medical data for someone who never became a
-- customer) previously sat there forever. Each row already carries an expires_at.
--
-- A daily pg_cron job now sweeps expired rows. It was created ad-hoc in an earlier
-- session and is already LIVE on both test and prod, but was never captured as a
-- migration (so a rebuild-from-migrations would lose it) and the grace period the
-- issue recommended was never applied. This migration makes it reproducible and
-- adds the grace.
--
-- GRACE: delete only rows expired for MORE THAN A DAY, not the instant they expire.
-- The stripe-webhook reads pending_bookings to turn a paid attempt into a real
-- booking; a slow/retried Stripe delivery arriving just after expiry must still
-- find its row. A whole day past expiry is far beyond any realistic webhook delay,
-- while still bounding how long abandoned medical data lingers.
--
-- pg_cron is already installed (schema `cron`) on both projects. cron.schedule()
-- keys on jobname, so re-running with the same name UPDATES the existing job in
-- place — this migration is idempotent and safe to re-apply.

SELECT cron.schedule(
  'cleanup-expired-pending-bookings',
  '0 3 * * *',  -- every day at 03:00
  $$DELETE FROM public.pending_bookings WHERE expires_at < NOW() - interval '1 day'$$
);
