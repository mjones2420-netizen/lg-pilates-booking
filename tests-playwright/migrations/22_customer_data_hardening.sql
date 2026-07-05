-- Migration 22: Customer-data hardening (#44, #47, #48)
-- Three anon-reachable data issues from the session-59 security review, all
-- shipped together in one test-then-prod apply cycle.
--
--   #44 — pending_bookings still carried a legacy anon INSERT door (policy +
--         grant) left over from the first Stripe design. The stripe-checkout
--         edge function now writes that row with the service-role key, so
--         nothing legitimate uses the anon path — but anon could still stuff
--         garbage rows (incl. fake PAR-Q health data). Lock it. Plus hygiene:
--         revoke the default PUBLIC EXECUTE on the sync_block_booked_count
--         trigger function (not exploitable via the API, but unnecessary).
--
--   #47 — lookup_customer (SECURITY DEFINER, anon-callable) returned
--         first_name, last_name, phone, customer_type for any email. The
--         booking page only ever uses the row's existence + id, so last_name
--         and phone leaked for free. Trim the return to (id, first_name).
--         This is the free-tier slice of #35 — the rate-limiting/enumeration
--         half still needs Supabase Pro (#19) and stays open.
--
--   #48 — upsert_customer (anon-callable) overwrote a customer's stored
--         name/phone with whatever the caller supplied whenever the email
--         already existed — anyone who guesses customer emails could corrupt
--         Louise's client list. New behaviour: name-locked / phone-open.
--         On an existing email match, NEVER overwrite first_name/last_name;
--         refresh phone + customer_type from the form (so a returning
--         customer's changed number is recorded). Email is the identity match
--         key and is never changed here — a booking with a new email creates a
--         new customer row (unchanged behaviour), merging stays a manual admin
--         job. Accepted trade-off: an anon caller who guesses an email can
--         still change that customer's phone; names (higher-value) stay locked.
--
-- Apply to TEST (ngzfhamjuviwfwuncrjo) first, then PRODUCTION
-- (mrlooyixnlxzcfmvnqme) after the suite is green and Mark confirms.

-- =====================================================================
-- PART A — #44: close the legacy anon door on pending_bookings + hygiene
-- =====================================================================
-- The policy + grant were never captured in the repo migrations; they live
-- only in the running DBs (confirmed present on both projects, session 59).
DROP POLICY IF EXISTS "anon_insert_pending_bookings" ON public.pending_bookings;
REVOKE INSERT ON public.pending_bookings FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_block_booked_count() FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- PART B — #47: trim lookup_customer to the minimum the flow needs
-- =====================================================================
-- Changing the RETURNS TABLE column set requires a DROP first (CREATE OR
-- REPLACE cannot change a function's return signature). The drop clears the
-- existing anon EXECUTE grant, so re-GRANT it in the same migration.
DROP FUNCTION IF EXISTS public.lookup_customer(text);

CREATE FUNCTION public.lookup_customer(p_email text)
  RETURNS TABLE(id integer, first_name text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id, c.first_name
  FROM customers c
  WHERE c.email = p_email
  LIMIT 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.lookup_customer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_customer(text) TO anon;

-- =====================================================================
-- PART C — #48: name-locked / phone-open upsert_customer
-- =====================================================================
-- Signature is unchanged, so CREATE OR REPLACE is fine (no drop / re-grant).
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
  SELECT id INTO existing_id FROM customers WHERE email = p_email LIMIT 1;
  IF existing_id IS NOT NULL THEN
    -- name-locked: never overwrite first_name/last_name (anon-clobber guard).
    -- phone-open: refresh phone + customer_type from the form so a returning
    -- customer's changed number is recorded. Email is the match key (untouched).
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
