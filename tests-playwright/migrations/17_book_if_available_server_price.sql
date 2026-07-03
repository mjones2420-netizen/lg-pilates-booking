-- ============================================================
-- Migration 17: book_if_available server-side price recompute (issue #46)
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to both.
-- Re-runnable: idempotent (CREATE OR REPLACE).
--
-- Closes the bank-transfer price-tampering hole, mirroring the #32 fix in
-- stripe-checkout: the browser used to tell this function what amount_due
-- to write on the booking, so a tampered call could book a block at £0.01.
-- The function now recomputes the amount itself from the block's own
-- price / weeks / start_date and IGNORES p_amount_due entirely.
--
-- The parameter is kept in the signature so existing callers (index.html
-- and the deployed stripe-webhook) keep working unchanged.
--
-- Prorata is computed from ISO date arithmetic (start_date + 7-day steps),
-- NOT the display-string dates[] column — that column's client-side parser
-- has a Dec–Jan year-inference bug (#54) and BST pitfalls. Logic mirrors
-- calcProrata() in index.html: if some-but-not-all sessions remain, charge
-- per remaining session; otherwise charge the full block.
--
-- Also validates p_class_id against the block's real class_id (same
-- hygiene as #32) and writes the block's own class_id on the booking, so a
-- forged class_id can no longer mislabel a booking row.
--
-- Error codes (front end string-matches these):
--   CLASS_FULL, ALREADY_BOOKED (existing), BLOCK_NOT_FOUND, CLASS_MISMATCH (new)
-- ============================================================

CREATE OR REPLACE FUNCTION public.book_if_available(p_block_id bigint, p_class_id bigint, p_customer_id bigint, p_amount_due numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booked     int;
  v_cap        int;
  v_class_id   bigint;
  v_price      numeric;
  v_weeks      int;
  v_start      date;
  v_remaining  int;
  v_amount     numeric;
  v_existing   int;
  v_booking_id bigint;
BEGIN
  SELECT booked, cap, class_id, price, weeks, start_date
    INTO v_booked, v_cap, v_class_id, v_price, v_weeks, v_start
    FROM blocks
   WHERE id = p_block_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND';
  END IF;

  IF v_class_id IS DISTINCT FROM p_class_id THEN
    RAISE EXCEPTION 'CLASS_MISMATCH';
  END IF;

  IF v_booked >= v_cap THEN
    RAISE EXCEPTION 'CLASS_FULL';
  END IF;

  -- Server-side prorata: sessions on or after today, from ISO dates.
  SELECT COUNT(*) INTO v_remaining
    FROM generate_series(0, v_weeks - 1) AS g(i)
   WHERE (v_start + (g.i * 7)) >= CURRENT_DATE;

  IF v_remaining > 0 AND v_remaining < v_weeks THEN
    v_amount := v_price * v_remaining;  -- mid-block joiner pays remaining sessions only
  ELSE
    v_amount := v_price * v_weeks;
  END IF;

  SELECT COUNT(*) INTO v_existing
    FROM bookings
   WHERE block_id    = p_block_id
     AND customer_id = p_customer_id
     AND status     != 'cancelled';

  IF v_existing > 0 THEN
    RAISE EXCEPTION 'ALREADY_BOOKED';
  END IF;

  INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
  VALUES (v_class_id, p_block_id, p_customer_id, 'reserved', v_amount)
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;

EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%bookings_unique_active_per_block%' THEN
      RAISE EXCEPTION 'ALREADY_BOOKED';
    ELSE
      RAISE;
    END IF;
END;
$function$;

-- Grants: unchanged on purpose. CREATE OR REPLACE preserves the existing
-- ACL, and this function MUST stay executable by anon — it is the public
-- booking path. The tamper-proofing above is what makes that safe.
