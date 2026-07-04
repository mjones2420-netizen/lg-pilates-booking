-- Migration 21: Transactional cascade-delete RPCs (#56)
-- deleteBlock/deleteClass/deleteCustomer/rfbConfirm currently run as a chain
-- of separate DELETEs fired one after another from the browser. If the
-- connection drops mid-chain, the job stops half-done. Each becomes a
-- single SECURITY DEFINER RPC so the whole operation is one transaction —
-- Postgres functions are atomic by default (any RAISE/error rolls back
-- everything the function did).
--
-- Admin-gated via is_admin() (#55, migration 20) since SECURITY DEFINER
-- bypasses RLS entirely — the function body is the only gate.
--
-- FK cascade note (see pg_constraint on this schema):
--   blocks.class_id   -> classes(id) ON DELETE CASCADE
--   bookings.block_id -> blocks(id)  ON DELETE CASCADE
--   parq.booking_id   -> bookings(id) ON DELETE CASCADE
--   customer_class_priority.* -> ON DELETE CASCADE
--   catch_up_swaps.*  -> ON DELETE CASCADE
-- So deleting a block or class only needs one DELETE statement — the DB
-- cascades the rest. customers is the one table where bookings/parq are
-- NOT cascaded (by design, so a customer can't vanish quietly out from
-- under booking history elsewhere) — that RPC deletes explicitly in order.

-- PART A: admin_delete_block
CREATE OR REPLACE FUNCTION public.admin_delete_block(p_block_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  DELETE FROM blocks WHERE id = p_block_id;
END;
$$;

-- PART B: admin_delete_class
-- classes can't rely on cascade alone: bookings has a direct NO ACTION FK to
-- classes (bookings_class_id_fkey) as well as an indirect CASCADE path via
-- blocks (blocks_class_id_fkey -> bookings_block_id_fkey). Postgres doesn't
-- guarantee the indirect cascade completes before the direct FK is checked,
-- so a class with bookings can spuriously fail with a FK violation. Delete
-- bookings (and waitlist, same NO ACTION FK to classes) explicitly first.
CREATE OR REPLACE FUNCTION public.admin_delete_class(p_class_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  DELETE FROM waitlist WHERE class_id = p_class_id;
  DELETE FROM bookings WHERE class_id = p_class_id;
  DELETE FROM classes  WHERE id = p_class_id;
END;
$$;

-- PART C: admin_delete_customer
CREATE OR REPLACE FUNCTION public.admin_delete_customer(p_customer_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  DELETE FROM parq     WHERE customer_id = p_customer_id;
  DELETE FROM bookings WHERE customer_id = p_customer_id;
  DELETE FROM waitlist WHERE customer_id = p_customer_id;
  DELETE FROM customers WHERE id = p_customer_id;
END;
$$;

-- PART D: admin_remove_from_block
-- Records the cancellation and removes the booking as one transaction, so
-- a dropped connection can never leave a cancellation row without the
-- booking gone (or vice versa). Sessions-attended and refund-amount are
-- Louise's own judgement calls (attendance count, optional manual refund
-- override) so they stay as trusted admin input, same as the pre-existing
-- client-side flow — this migration is about atomicity, not price
-- recomputation (that trust model is unchanged from today).
-- Everything else — class name, venue, block dates, price-per-session,
-- customer/class/block IDs, and the customer's own name/email — is looked
-- up server-side from the booking's own row rather than trusted from the
-- client (code review caught the first draft trusting a client-supplied
-- name/email split from a display string instead of reading the customer
-- row it already has the ID for).
CREATE OR REPLACE FUNCTION public.admin_remove_from_block(
  p_booking_id        integer,
  p_sessions_attended integer,
  p_refund_amount     numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_id bigint;
  v_class_id    bigint;
  v_block_id    bigint;
  v_first_name  text;
  v_last_name   text;
  v_email       text;
  v_class_name  text;
  v_venue       text;
  v_start_date  date;
  v_end_date    date;
  v_weeks       int;
  v_price       int;
  v_stripe_pi   text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT b.customer_id, b.class_id, b.block_id,
         cu.first_name, cu.last_name, cu.email,
         c.name, c.venue,
         bl.start_date, bl.end_date, bl.weeks, bl.price, b.stripe_payment_intent_id
    INTO v_customer_id, v_class_id, v_block_id,
         v_first_name, v_last_name, v_email,
         v_class_name, v_venue,
         v_start_date, v_end_date, v_weeks, v_price, v_stripe_pi
    FROM bookings b
    JOIN classes   c  ON c.id  = b.class_id
    JOIN blocks    bl ON bl.id = b.block_id
    JOIN customers cu ON cu.id = b.customer_id
   WHERE b.id = p_booking_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  INSERT INTO cancellations (
    customer_id, class_id, block_id, first_name, last_name, email,
    class_name, venue, block_start_date, block_end_date,
    sessions_attended, sessions_remaining, price_per_session,
    refund_amount, refunded, stripe_payment_intent_id
  ) VALUES (
    v_customer_id, v_class_id, v_block_id,
    COALESCE(v_first_name, ''), COALESCE(v_last_name, ''), COALESCE(v_email, ''),
    v_class_name, v_venue, v_start_date, v_end_date,
    p_sessions_attended, v_weeks - p_sessions_attended, v_price,
    p_refund_amount, false, v_stripe_pi
  );

  DELETE FROM bookings WHERE id = p_booking_id;
END;
$$;

-- Grant hygiene: authenticated (admin dashboard) only, never anon.
REVOKE ALL ON FUNCTION public.admin_delete_block(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_block(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_block(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_class(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_class(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_class(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_customer(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_customer(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_customer(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_remove_from_block(integer, integer, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_remove_from_block(integer, integer, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_from_block(integer, integer, numeric) TO authenticated;
