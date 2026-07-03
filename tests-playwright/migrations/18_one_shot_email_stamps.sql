-- ============================================================
-- Migration 18: one-shot email stamps on bookings (issue #45)
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to both.
-- Re-runnable: idempotent (ADD COLUMN IF NOT EXISTS).
--
-- The send-email Edge Function's public path (reserved_confirmation /
-- new_booking_alert) could be called repeatedly for any booking id —
-- sequential ids make that a spam/harassment vector from the real
-- bookings@ address. These columns let the function claim each send
-- atomically (UPDATE ... WHERE <col> IS NULL) so each booking gets each
-- public email exactly once. Enforcement lives in send-email/index.ts.
--
-- Anon cannot read or write bookings (RLS + no grants — see migration 15),
-- so the stamps are not exposed; the Edge Function uses the service role.
-- ============================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reserved_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_email_sent_at timestamptz;
