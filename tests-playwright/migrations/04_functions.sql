-- Migration 04: Functions
-- All 6 PL/pgSQL functions, verbatim from production.
-- NOTE: Must be applied via Supabase CLI or MCP apply_migration, NOT the web SQL
-- editor — the web editor's parser rejects the DECLARE variables (Supabase bug
-- confirmed in Session 6). CLI / apply_migration works fine.

CREATE OR REPLACE FUNCTION public.lookup_customer(p_email text)
 RETURNS TABLE(id integer, first_name text, last_name text, phone text, customer_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id, c.first_name, c.last_name, c.phone, c.customer_type
  FROM customers c
  WHERE c.email = p_email
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_customer(p_first_name text, p_last_name text, p_email text, p_phone text, p_customer_type text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_id integer;
  new_id integer;
BEGIN
  SELECT id INTO existing_id FROM customers WHERE email = p_email LIMIT 1;
  IF existing_id IS NOT NULL THEN
    UPDATE customers
    SET first_name=p_first_name, last_name=p_last_name, phone=p_phone, customer_type=p_customer_type
    WHERE id = existing_id;
    RETURN existing_id;
  ELSE
    INSERT INTO customers (first_name, last_name, email, phone, customer_type)
    VALUES (p_first_name, p_last_name, p_email, p_phone, p_customer_type)
    RETURNING id INTO new_id;
    RETURN new_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.book_if_available(p_block_id bigint, p_class_id bigint, p_customer_id bigint, p_amount_due numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booked     int;
  v_cap        int;
  v_existing   int;
  v_booking_id bigint;
BEGIN
  SELECT booked, cap
    INTO v_booked, v_cap
    FROM blocks
   WHERE id = p_block_id
     FOR UPDATE;

  IF v_booked >= v_cap THEN
    RAISE EXCEPTION 'CLASS_FULL';
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
  VALUES (p_class_id, p_block_id, p_customer_id, 'reserved', p_amount_due)
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

CREATE OR REPLACE FUNCTION public.check_priority_access(p_email text, p_block_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id BIGINT;
  v_class_id BIGINT;
  v_start_date DATE;
  v_prev_block_id BIGINT;
  v_has_manual_priority BOOLEAN;
  v_has_prev_booking BOOLEAN;
BEGIN
  SELECT id INTO v_customer_id
  FROM customers WHERE email = p_email LIMIT 1;

  IF v_customer_id IS NULL THEN RETURN FALSE; END IF;

  SELECT class_id, start_date INTO v_class_id, v_start_date
  FROM blocks WHERE id = p_block_id;

  IF v_class_id IS NULL THEN RETURN FALSE; END IF;

  SELECT EXISTS(
    SELECT 1 FROM customer_class_priority
    WHERE customer_id = v_customer_id AND class_id = v_class_id
  ) INTO v_has_manual_priority;

  IF v_has_manual_priority THEN RETURN TRUE; END IF;

  SELECT id INTO v_prev_block_id
  FROM blocks
  WHERE class_id = v_class_id AND id != p_block_id AND end_date < v_start_date
  ORDER BY end_date DESC LIMIT 1;

  IF v_prev_block_id IS NULL THEN RETURN FALSE; END IF;

  SELECT EXISTS(
    SELECT 1 FROM bookings
    WHERE customer_id = v_customer_id AND block_id = v_prev_block_id AND status = 'confirmed'
  ) INTO v_has_prev_booking;

  RETURN v_has_prev_booking;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_active_booking_on_block(p_customer_id bigint, p_block_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM bookings
   WHERE customer_id = p_customer_id
     AND block_id    = p_block_id
     AND status     != 'cancelled';
  RETURN v_count > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_block_booked_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_block_id BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_block_id := OLD.block_id;
  ELSE
    v_block_id := NEW.block_id;
  END IF;

  UPDATE blocks
  SET booked = (
    SELECT COUNT(*)
    FROM bookings
    WHERE block_id = v_block_id
    AND status != 'cancelled'
  )
  WHERE id = v_block_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
