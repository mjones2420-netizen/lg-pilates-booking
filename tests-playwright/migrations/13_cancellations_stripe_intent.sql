-- ============================================================
-- Migration 13: Add stripe_payment_intent_id to cancellations
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to both, confirm before each.
-- Re-runnable: idempotent (IF NOT EXISTS).
--
-- Why (T1-09a / issue #27): when a client is removed from a block,
-- rfbConfirm() inserts a cancellations row and then DELETES the bookings
-- row. The booking's stripe_payment_intent_id is lost at that point, so a
-- later refund has no payment to act against. This column preserves the
-- payment reference onto the cancellation record so Phase 2 (#28) can issue
-- the real Stripe refund from the Cancellations report.
--
-- Purely additive: nullable column, no behaviour change on its own.
-- Existing rows and bank-transfer cancellations simply hold NULL.
-- ============================================================

ALTER TABLE public.cancellations
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
