-- ============================================================
-- Migration 19: soften the max-2-per-source-block catch-up rule (issue #61)
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to both.
-- Re-runnable: DROP + CREATE (new parameter = new function signature in
-- Postgres, so CREATE OR REPLACE alone would leave the old 5-arg version
-- behind as an overload).
--
-- The max-2 rule stays as the default behaviour (CU_LIMIT still raised),
-- but Louise can now override it per save. p_allow_over_limit defaults to
-- false so every existing caller (and the browser's first save attempt)
-- behaves exactly as before. The UI passes true only on an explicit
-- "Save Anyway" click after showing the same CU_LIMIT message as a warning.
--
-- Capacity (CU_FULL) is NOT overridable — overbooking a physical session
-- is never a business decision the RPC should allow around.
-- ============================================================

DROP FUNCTION IF EXISTS public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.record_catch_up_swap(
  p_customer_id       INTEGER,
  p_source_block_id   INTEGER,
  p_target_block_id   INTEGER,
  p_class_date        DATE,
  p_notes             TEXT DEFAULT NULL,
  p_allow_over_limit  BOOLEAN DEFAULT FALSE
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap           INTEGER;
  v_booked        INTEGER;
  v_swaps_on_date INTEGER;
  v_existing      INTEGER;
  v_new_id        INTEGER;
BEGIN
  IF p_customer_id IS NULL OR p_source_block_id IS NULL
     OR p_target_block_id IS NULL OR p_class_date IS NULL THEN
    RAISE EXCEPTION 'CU_MISSING_FIELDS: customer, source block, target block and date are all required';
  END IF;

  IF p_source_block_id = p_target_block_id THEN
    RAISE EXCEPTION 'CU_SAME_BLOCK: the visiting block must be different from the regular block';
  END IF;

  -- Lock the target block row: concurrent saves into the same block
  -- serialise here, so the second save sees the first save's row.
  SELECT cap, COALESCE(booked, 0) INTO v_cap, v_booked
  FROM blocks
  WHERE id = p_target_block_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CU_BLOCK_NOT_FOUND: target block % does not exist', p_target_block_id;
  END IF;

  PERFORM 1 FROM blocks WHERE id = p_source_block_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CU_BLOCK_NOT_FOUND: source block % does not exist', p_source_block_id;
  END IF;

  -- Lock the customer row: serialises concurrent saves for the same
  -- customer across different target blocks (max-2 race).
  PERFORM 1 FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CU_CUSTOMER_NOT_FOUND: customer % does not exist', p_customer_id;
  END IF;

  SELECT COUNT(*) INTO v_swaps_on_date
  FROM catch_up_swaps
  WHERE target_block_id = p_target_block_id
    AND class_date      = p_class_date;

  IF (v_booked + v_swaps_on_date + 1) > v_cap THEN
    RAISE EXCEPTION 'CU_FULL: that session date is already at capacity';
  END IF;

  SELECT COUNT(*) INTO v_existing
  FROM catch_up_swaps
  WHERE customer_id     = p_customer_id
    AND source_block_id = p_source_block_id;

  IF v_existing >= 2 AND NOT p_allow_over_limit THEN
    RAISE EXCEPTION 'CU_LIMIT: customer has already used 2 catch-up swaps for that block';
  END IF;

  INSERT INTO catch_up_swaps (customer_id, source_block_id, target_block_id, class_date, notes)
  VALUES (p_customer_id, p_source_block_id, p_target_block_id, p_class_date, NULLIF(TRIM(p_notes), ''))
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- SECURITY DEFINER bypasses RLS, so grant hygiene is the gate:
-- admin (authenticated) only — anon must NOT be able to execute.
REVOKE ALL ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT, BOOLEAN) TO service_role;
