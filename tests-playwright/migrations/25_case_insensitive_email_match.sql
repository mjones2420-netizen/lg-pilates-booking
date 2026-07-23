-- Migration 25: Case-insensitive email matching (#78)
-- Three SECURITY DEFINER functions matched customer email with a plain
-- case-sensitive `=`, and the front end only .trim()s the input (never
-- lowercases it). So a customer whose stored email is `mark@x.com` but who
-- types `Mark@X.com` looks like a DIFFERENT person:
--
--   check_priority_access  — customer lookup fails, returns FALSE (access
--                            denied) even though they hold priority. This is
--                            the one that wrongly refused Mark on PROD
--                            (2026-07-06, `Mjones970@live.co.uk`).
--   lookup_customer        — a returning customer reads as brand-new.
--   upsert_customer        — WORST case: a different-case email on an existing
--                            customer INSERTs a DUPLICATE row instead of
--                            matching, splitting one client across two records.
--
-- Fix: compare LOWER(email) = LOWER(p_email) on both sides in all three.
-- Stored email values are left as-typed (not normalised) — matching is now
-- case-insensitive regardless of how either side is cased, so normalising
-- storage is unnecessary and would be a data migration for no extra benefit.
--
-- Signatures are UNCHANGED, so CREATE OR REPLACE is safe for all three — no
-- DROP, no re-GRANT (existing anon/authenticated grants are preserved).
--
-- Apply to TEST (ngzfhamjuviwfwuncrjo) first, then PRODUCTION
-- (mrlooyixnlxzcfmvnqme) after the suite is green and Mark confirms.

-- =====================================================================
-- lookup_customer — anon-callable, returns (id, first_name) since #47
-- =====================================================================
CREATE OR REPLACE FUNCTION public.lookup_customer(p_email text)
  RETURNS TABLE(id integer, first_name text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id, c.first_name
  FROM customers c
  WHERE LOWER(c.email) = LOWER(p_email)
  LIMIT 1;
END;
$function$;

-- =====================================================================
-- upsert_customer — anon-callable, name-locked / phone-open since #48
-- =====================================================================
CREATE OR REPLACE FUNCTION public.upsert_customer(
  p_first_name text, p_last_name text, p_email text, p_phone text, p_customer_type text)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  existing_id integer;
  new_id integer;
BEGIN
  SELECT id INTO existing_id FROM customers WHERE LOWER(email) = LOWER(p_email) LIMIT 1;
  IF existing_id IS NOT NULL THEN
    -- name-locked: never overwrite first_name/last_name (anon-clobber guard).
    -- phone-open: refresh phone + customer_type from the form.
    UPDATE customers
    SET phone = p_phone,
        customer_type = p_customer_type
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

-- =====================================================================
-- check_priority_access — anon-callable priority gate (04_functions.sql)
-- =====================================================================
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
  FROM customers WHERE LOWER(email) = LOWER(p_email) LIMIT 1;

  IF v_customer_id IS NULL THEN RETURN FALSE; END IF;

  SELECT class_id, start_date INTO v_class_id, v_start_date
  FROM blocks WHERE id = p_block_id;

  IF v_class_id IS NULL THEN RETURN FALSE; END IF;

  SELECT EXISTS(
    SELECT 1 FROM customer_class_priority
    WHERE customer_id = v_customer_id AND class_id = v_class_id
  ) INTO v_has_manual_priority;

  IF v_has_manual_priority THEN RETURN TRUE; END IF;

  -- Fall through to prior-booking priority (unchanged from 04_functions.sql).
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
