-- ============================================================
-- Migration 31: catch-up swaps respect waiting-list holds
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to both.
--
-- Louise's decision (session 99): a seat held for a waiting-list person
-- (waitlist.status = 'offered') is taken for catch-up purposes. Previously
-- record_catch_up_swap counted only booked + swaps on the date, so a held
-- chair looked free for a one-week visitor — and if the held person then
-- booked, that evening ran one over.
--
-- Only OFFERED holds count. People still waiting (not yet offered) hold no
-- chair, so catch-ups may still use a seat they're queued for.
--
-- New code CU_HELD (not CU_FULL) so the dashboard can say WHY: releasing
-- the hold frees the seat again. CU_FULL keeps priority when the date is
-- full even without holds.
--
-- The reverse case (offering a hold onto a date a catch-up already
-- occupies) is deliberately still allowed — Mark's decision, session 99:
-- blocking a 6-week offer over one evening is worse than the dashboard's
-- over-capacity warning, which now counts holds too (index.html).
--
-- Same signature as migration 19, so CREATE OR REPLACE keeps the existing
-- grants (authenticated + service_role only). Re-asserted below anyway.
-- Concurrency: the target block row is locked FOR UPDATE here, and
-- offer_waitlist_space locks the same row, so the hold count can't change
-- under this check.
-- ============================================================

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
  v_held          INTEGER;
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

  SELECT COUNT(*) INTO v_held
  FROM waitlist
  WHERE block_id = p_target_block_id
    AND status   = 'offered';

  IF (v_booked + v_swaps_on_date + v_held + 1) > v_cap THEN
    RAISE EXCEPTION 'CU_HELD: the remaining space is being held for someone on the waiting list';
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

REVOKE ALL ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_catch_up_swap(INTEGER, INTEGER, INTEGER, DATE, TEXT, BOOLEAN) TO service_role;
