-- ============================================================
-- Migration 12: Ensure payment_mode resets to bank_transfer on reseed
-- Target: lg-pilates-test project (ngzfhamjuviwfwuncrjo)
-- Re-runnable: safe to execute any day
--
-- Why: PM-session testing temporarily sets payment_mode to 'stripe'.
-- If that state survives into a later npm test run (e.g. an ST spec's
-- afterEach didn't restore it), every CB/EC/PB/SE spec that reaches
-- Step 3/4 of the booking modal fails — the app renders the Stripe
-- "Proceed to Payment" button instead of "Reserve My Spot", which the
-- bank-transfer specs look for.
--
-- This migration guarantees a known-good payment_mode at the start of
-- every reseed, regardless of leftover state. stripe_publishable_key is
-- deliberately left untouched so it doesn't need re-entering via the
-- admin Settings UI after every reseed.
-- ============================================================

INSERT INTO settings (key, value)
VALUES ('payment_mode', 'bank_transfer')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
