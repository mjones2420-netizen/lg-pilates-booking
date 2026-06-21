-- ============================================================
-- Migration 14: Catch-up swaps table
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to both, confirm before each.
-- Re-runnable: idempotent (IF NOT EXISTS / DROP IF EXISTS).
--
-- Allows Louise to record when a customer attends a different
-- block's session for one week instead of their usual class.
-- Admin-only — no anon access.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catch_up_swaps (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  source_block_id INTEGER NOT NULL REFERENCES public.blocks(id)    ON DELETE CASCADE,
  target_block_id INTEGER NOT NULL REFERENCES public.blocks(id)    ON DELETE CASCADE,
  class_date      DATE    NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.catch_up_swaps ENABLE ROW LEVEL SECURITY;

-- Admin full access; anon gets nothing (no explicit grant = no access)
DROP POLICY IF EXISTS "admin_all_catch_up_swaps" ON public.catch_up_swaps;
CREATE POLICY "admin_all_catch_up_swaps" ON public.catch_up_swaps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.catch_up_swaps FROM anon;

-- Clear any stale test data (no-op on first run, cleanup on subsequent reseeds)
DELETE FROM public.catch_up_swaps;
