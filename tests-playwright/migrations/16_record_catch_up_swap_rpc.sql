-- ============================================================
-- Migration 16: record_catch_up_swap RPC (issue #59)
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to both.
-- Re-runnable: idempotent (CREATE OR REPLACE).
--
-- Moves the catch-up swap capacity check and the max-2-per-source-block
-- check out of the browser and into the database. The function locks the
-- target block row and the customer row, so two saves racing each other
-- (double-click, two tabs, two admins) serialise and the second one sees
-- the first one's insert. Overbooking at the moment of saving becomes
-- impossible; the dashboard over-cap banner remains as a drift monitor
-- for blocks that go over capacity AFTER a valid swap exists.
--
-- Error codes (client maps these to friendly inline messages):
--   CU_MISSING_FIELDS, CU_SAME_BLOCK, CU_BLOCK_NOT_FOUND,
--   CU_CUSTOMER_NOT_FOUND, CU_FULL, CU_LIMIT
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_catch_up_swap(
  p_customer_id     INTEGER,
  p_source_block_id INTEGER,
  p_target_block_id INTEGER,
  p_class_date      DATE,
  p_notes           TEXT DEFAULT NULL
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

  IF v_existing >= 2 THEN
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
REVOKE ALL ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT) TO service_role;
