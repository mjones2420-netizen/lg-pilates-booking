-- ============================================================
-- Migration 34: Data protection for health forms + T&C version record
-- Issues #90 (PAR-Q retention, consent, export/erase) and #91 (T&C versions)
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to TEST first, PROD on approval
--         (Mark pastes it into the SQL Editor after a rolled-back dry run).
-- Re-runnable: idempotent (IF EXISTS / IF NOT EXISTS / ON CONFLICT / DROP + CREATE).
--
-- WHAT
-- A. terms_versions — the exact wording of each version of the booking T&Cs,
--    the PAR-Q declaration and the health-consent tick box (#91).
-- B. Consent / version columns on bookings, parq and pending_bookings.
--    All nullable: rows from before this migration stay NULL = "not recorded".
--    No back-fill — that would invent consent that was never collected.
-- C. data_protection_log — an accountability trail (no personal data in it).
-- D. book_if_available gains p_terms_version (6 args, DEFAULT NULL so the
--    current front end keeps working until index.html is pushed).
-- E. insert_parq gains p_declaration_version + p_health_consent_version.
-- F. anonymise_stale_parq() — clears health answers + emergency contact of
--    customers whose last activity is older than settings.parq_retention_months.
--    Does NOTHING until that settings row exists (switch-on is a separate,
--    deliberate step). Floor of 6 months guards against a typo like '1'.
-- G. Admin RPCs: retention preview, clear one customer's health form now,
--    export everything held on a customer; admin_delete_customer also
--    removes waitlist_requests + pending_bookings (cancellations are KEPT —
--    financial records, Mark's decision 05 Oct 2026).
-- H. Nightly cron job 'anonymise-stale-parq' at 03:20 UTC.
-- ============================================================

-- ------------------------------------------------------------
-- A. terms_versions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.terms_versions (
  version         text PRIMARY KEY,
  kind            text NOT NULL CHECK (kind IN ('booking_terms','parq_declaration','health_consent','privacy_notice')),
  body            text NOT NULL,
  effective_from  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terms_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_terms_versions" ON public.terms_versions;
CREATE POLICY "admin_read_terms_versions" ON public.terms_versions
  FOR SELECT TO authenticated USING (is_admin());
REVOKE ALL ON public.terms_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.terms_versions TO authenticated;
GRANT ALL ON public.terms_versions TO service_role;

-- Bodies are the rendered text, whitespace collapsed:
--   el.textContent.replace(/\s+/g,' ').trim()
-- Spec DP-04 compares the live page's text (normalised the same way) with
-- body, so a wording change without a new version row fails the suite. To change wording: edit index.html,
-- bump the constant there, add a new row in a new migration.
INSERT INTO public.terms_versions (version, kind, body) VALUES
  ('tcs-2026-10',            'booking_terms',    $t$Payment is to be made before the start of a block, no later than 48 hours. Blocks will run between 4–6 weeks dependent on school holidays, instructor holiday or venue availability. Advance notice will be given regarding block length and any changes to blocks or block prices. Please make payment within the time frame stated on the invoice. To secure your space it is recommended payment is made promptly. You pay for your block upfront regardless of how many sessions you attend. If you cancel your block booking you must give the instructor at least 48 hours notice. Any cancellations after this time will be charged. If you are aware you cannot make one of the sessions within the block, please notify the instructor in advance and they will try to accommodate you into another class, although this will be dependent on availability. You must make up your session within the block. Classes cannot be carried over into a new block. Blocks cannot be carried on to other blocks. A recorded video will be available if you are unable to make up the session in person. There will be a new recording for each block. Missed classes will not be refunded. Classes cannot be refunded due to weather (snow, heatwaves etc), but an online/Zoom class will be provided. No participants under the age of 18. Participants are not to bring children to class. You are responsible for any personal belongings that you bring to class. Please arrive early for your class. The instructor has the right to refuse late participants. By booking your block you agree to accept the terms and conditions for LG Pilates.$t$),
  ('parq-decl-2026-10',      'parq_declaration', $t$I have answered all the questions on this form honestly and I am aware that if I answered YES to any of the questions I will need to consult my doctor before taking part in the class. I am aware that if my circumstances in health or medical conditions change I must notify my instructor, and it is my responsibility to do so.$t$),
  ('health-consent-2026-10', 'health_consent',   $t$I agree to LG Pilates keeping my health answers.$t$)
ON CONFLICT (version) DO NOTHING;

-- ------------------------------------------------------------
-- B. Consent / version columns
-- ------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS terms_version     text REFERENCES public.terms_versions(version),
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

ALTER TABLE public.parq
  ADD COLUMN IF NOT EXISTS declaration_version    text REFERENCES public.terms_versions(version),
  ADD COLUMN IF NOT EXISTS health_consent_version text REFERENCES public.terms_versions(version),
  ADD COLUMN IF NOT EXISTS health_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS anonymised_at          timestamptz;

-- pending_bookings was created ad hoc (no CREATE TABLE in any migration).
ALTER TABLE public.pending_bookings
  ADD COLUMN IF NOT EXISTS terms_version     text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- ------------------------------------------------------------
-- C. data_protection_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_protection_log (
  id           bigserial PRIMARY KEY,
  happened_at  timestamptz NOT NULL DEFAULT now(),
  action       text NOT NULL CHECK (action IN ('auto_anonymise_parq','admin_anonymise_parq','admin_export_customer','admin_delete_customer')),
  customer_id  integer,            -- deliberately no FK: the row must outlive a deleted customer
  parq_rows    integer,
  actor        uuid DEFAULT auth.uid()
);

ALTER TABLE public.data_protection_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_data_protection_log" ON public.data_protection_log;
CREATE POLICY "admin_read_data_protection_log" ON public.data_protection_log
  FOR SELECT TO authenticated USING (is_admin());
REVOKE ALL ON public.data_protection_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.data_protection_log TO authenticated;
GRANT ALL ON public.data_protection_log TO service_role;
REVOKE ALL ON SEQUENCE public.data_protection_log_id_seq FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- D. book_if_available v4 — records the T&C version
-- ------------------------------------------------------------
-- DROP + CREATE, never overload (an extra version would make rpc() calls
-- ambiguous). DROP wipes the ACL, so grants are restated below.
DROP FUNCTION IF EXISTS public.book_if_available(bigint, bigint, bigint, numeric, uuid);
DROP FUNCTION IF EXISTS public.book_if_available(bigint, bigint, bigint, numeric, uuid, text);

CREATE FUNCTION public.book_if_available(
  p_block_id      bigint,
  p_class_id      bigint,
  p_customer_id   bigint,
  p_amount_due    numeric,
  p_offer_token   uuid DEFAULT NULL,
  p_terms_version text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booked      int;
  v_cap         int;
  v_class_id    bigint;
  v_price       numeric;
  v_weeks       int;
  v_start       date;
  v_remaining   int;
  v_amount      numeric;
  v_existing    int;
  v_booking_id  bigint;
  v_wait        int;
  v_wl_id       int;
  v_wl_customer int;
BEGIN
  -- NULL is still accepted while the old front end may be live (#90 rollout).
  -- A follow-up makes it required.
  IF p_terms_version IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM terms_versions WHERE version = p_terms_version AND kind = 'booking_terms'
  ) THEN
    RAISE EXCEPTION 'TERMS_VERSION_UNKNOWN';
  END IF;

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

  IF p_offer_token IS NOT NULL THEN
    -- Token path: this person was personally offered the space, so the
    -- reservation rule does not apply to them — only the physical seat count.
    SELECT id, customer_id
      INTO v_wl_id, v_wl_customer
      FROM waitlist
     WHERE offer_token = p_offer_token
       AND block_id    = p_block_id
       AND status      = 'offered'
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WL_BAD_TOKEN';
    END IF;

    -- A leaked link is useless to anyone but its owner.
    IF v_wl_customer IS DISTINCT FROM p_customer_id THEN
      RAISE EXCEPTION 'WL_TOKEN_MISMATCH';
    END IF;

    IF v_booked >= v_cap THEN
      RAISE EXCEPTION 'CLASS_FULL';
    END IF;
  ELSE
    -- Public path: the reservation rule. While anyone is waiting, a freed
    -- space is not available to the general public.
    SELECT COUNT(*) INTO v_wait FROM waitlist WHERE block_id = p_block_id;

    IF (v_booked + v_wait) >= v_cap THEN
      RAISE EXCEPTION 'CLASS_FULL';
    END IF;
  END IF;

  -- Server-side prorata: sessions on or after today, from ISO dates (#54).
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

  INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due,
                        terms_version, terms_accepted_at)
  VALUES (v_class_id, p_block_id, p_customer_id, 'reserved', v_amount,
          p_terms_version,
          CASE WHEN p_terms_version IS NOT NULL THEN now() END)
  RETURNING id INTO v_booking_id;

  -- Consume the hold only once the booking actually exists.
  IF v_wl_id IS NOT NULL THEN
    DELETE FROM waitlist WHERE id = v_wl_id;
  END IF;

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

REVOKE ALL ON FUNCTION public.book_if_available(bigint, bigint, bigint, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_if_available(bigint, bigint, bigint, numeric, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.book_if_available(bigint, bigint, bigint, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_if_available(bigint, bigint, bigint, numeric, uuid, text) TO service_role;

-- ------------------------------------------------------------
-- E. insert_parq v2 — records declaration + consent versions
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.insert_parq(bigint, bigint,
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, date);
DROP FUNCTION IF EXISTS public.insert_parq(bigint, bigint,
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, date, text, text);

CREATE FUNCTION public.insert_parq(
  p_booking_id       bigint,
  p_customer_id      bigint,
  p_age              text,
  p_q1_heart         text,
  p_q2_circulatory   text,
  p_q3_blood_pressure text,
  p_q4_chest_pain    text,
  p_q5_joint         text,
  p_q6_dizziness     text,
  p_q7_pregnant      text,
  p_q8_doctor_advised text,
  p_q9_spinal        text,
  p_q10_medication   text,
  p_q11_asthma       text,
  p_q12_other_reasons text,
  p_yes_details      text,
  p_additional_notes text,
  p_emergency_name   text,
  p_emergency_relationship text,
  p_emergency_phone  text,
  p_print_name       text,
  p_sign_date        date,
  p_declaration_version    text DEFAULT NULL,
  p_health_consent_version text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate booking exists and belongs to the stated customer
  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE id = p_booking_id AND customer_id = p_customer_id
  ) THEN
    RAISE EXCEPTION 'INVALID_BOOKING';
  END IF;

  IF p_declaration_version IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM terms_versions WHERE version = p_declaration_version AND kind = 'parq_declaration'
  ) THEN
    RAISE EXCEPTION 'CONSENT_VERSION_UNKNOWN';
  END IF;

  IF p_health_consent_version IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM terms_versions WHERE version = p_health_consent_version AND kind = 'health_consent'
  ) THEN
    RAISE EXCEPTION 'CONSENT_VERSION_UNKNOWN';
  END IF;

  INSERT INTO parq (
    booking_id, customer_id, age,
    q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain,
    q5_joint, q6_dizziness, q7_pregnant, q8_doctor_advised,
    q9_spinal, q10_medication, q11_asthma, q12_other_reasons,
    yes_details, additional_notes,
    emergency_name, emergency_relationship, emergency_phone,
    print_name, sign_date,
    declaration_version, health_consent_version, health_consent_at
  ) VALUES (
    p_booking_id, p_customer_id, p_age,
    p_q1_heart, p_q2_circulatory, p_q3_blood_pressure, p_q4_chest_pain,
    p_q5_joint, p_q6_dizziness, p_q7_pregnant, p_q8_doctor_advised,
    p_q9_spinal, p_q10_medication, p_q11_asthma, p_q12_other_reasons,
    p_yes_details, p_additional_notes,
    p_emergency_name, p_emergency_relationship, p_emergency_phone,
    p_print_name, p_sign_date,
    p_declaration_version, p_health_consent_version,
    CASE WHEN p_health_consent_version IS NOT NULL THEN now() END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_parq(bigint, bigint,
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_parq(bigint, bigint,
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, date, text, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- F. Retention: who is stale, and the clear-down itself
-- ------------------------------------------------------------
-- Internal helper — one definition of "stale" shared by the job and the
-- admin preview. A customer is stale when they still have an uncleared
-- PAR-Q and ALL of these are older than the cutoff: every block they ever
-- booked (any status, the cautious choice), every PAR-Q they submitted.
-- Anyone on a waiting list or mid-card-payment is never touched.
CREATE OR REPLACE FUNCTION public._stale_parq_customers(p_cutoff date, p_only_customer integer DEFAULT NULL)
RETURNS SETOF integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
    FROM customers c
   WHERE (p_only_customer IS NULL OR c.id = p_only_customer)
     AND EXISTS (SELECT 1 FROM parq p WHERE p.customer_id = c.id AND p.anonymised_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM bookings b JOIN blocks bl ON bl.id = b.block_id
                      WHERE b.customer_id = c.id AND bl.end_date >= p_cutoff)
     AND NOT EXISTS (SELECT 1 FROM parq p WHERE p.customer_id = c.id AND p.created_at::date >= p_cutoff)
     AND NOT EXISTS (SELECT 1 FROM waitlist w WHERE w.customer_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM pending_bookings pb WHERE lower(pb.email) = lower(c.email));
$$;
REVOKE ALL ON FUNCTION public._stale_parq_customers(date, integer) FROM PUBLIC, anon, authenticated;

-- Retention months: explicit argument (tests) or the settings row.
-- Missing / non-numeric / below the 6-month floor → NULL = do nothing.
CREATE OR REPLACE FUNCTION public._parq_retention_months(p_months integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_raw    text;
  v_months integer;
BEGIN
  IF p_months IS NOT NULL THEN
    v_months := p_months;
  ELSE
    SELECT value INTO v_raw FROM settings WHERE key = 'parq_retention_months';
    IF v_raw IS NULL OR btrim(v_raw) !~ '^[0-9]{1,4}$' THEN
      RETURN NULL;
    END IF;
    v_months := btrim(v_raw)::integer;
  END IF;
  IF v_months < 6 THEN
    RETURN NULL;
  END IF;
  RETURN v_months;
END;
$$;
REVOKE ALL ON FUNCTION public._parq_retention_months(integer) FROM PUBLIC, anon, authenticated;

-- The fields that ARE health data / emergency contact get NULLed. Kept:
-- ids, booking/customer link, sign_date, created_at and the consent/version
-- columns — the evidence that a form and consent existed, none of it health data.
CREATE OR REPLACE FUNCTION public._clear_parq_for_customer(p_customer_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE parq SET
    age = NULL,
    q1_heart = NULL, q2_circulatory = NULL, q3_blood_pressure = NULL, q4_chest_pain = NULL,
    q5_joint = NULL, q6_dizziness = NULL, q7_pregnant = NULL, q8_doctor_advised = NULL,
    q9_spinal = NULL, q10_medication = NULL, q11_asthma = NULL, q12_other_reasons = NULL,
    yes_details = NULL, additional_notes = NULL,
    emergency_name = NULL, emergency_relationship = NULL, emergency_phone = NULL,
    print_name = NULL,
    anonymised_at = now()
  WHERE customer_id = p_customer_id
    AND anonymised_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public._clear_parq_for_customer(integer) FROM PUBLIC, anon, authenticated;

-- The nightly job. p_as_of / p_only_customer / p_months exist so specs can
-- fake the date and stay inside their own data on the shared test DB.
-- Callable only by postgres (cron) and service_role.
DROP FUNCTION IF EXISTS public.anonymise_stale_parq(date, integer, integer);
CREATE FUNCTION public.anonymise_stale_parq(
  p_as_of         date    DEFAULT CURRENT_DATE,
  p_only_customer integer DEFAULT NULL,
  p_months        integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_months integer := _parq_retention_months(p_months);
  v_cutoff date;
  v_total  integer := 0;
  v_n      integer;
  v_cust   integer;
BEGIN
  IF v_months IS NULL THEN
    RETURN 0;   -- not switched on (or a bad setting): do nothing
  END IF;
  v_cutoff := (p_as_of - make_interval(months => v_months))::date;

  FOR v_cust IN SELECT * FROM _stale_parq_customers(v_cutoff, p_only_customer) LOOP
    v_n := _clear_parq_for_customer(v_cust);
    IF v_n > 0 THEN
      INSERT INTO data_protection_log (action, customer_id, parq_rows)
      VALUES ('auto_anonymise_parq', v_cust, v_n);
      v_total := v_total + v_n;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.anonymise_stale_parq(date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymise_stale_parq(date, integer, integer) TO service_role;

-- ------------------------------------------------------------
-- G. Admin RPCs
-- ------------------------------------------------------------
-- Dry-run count before switching the job on (or to check it later).
DROP FUNCTION IF EXISTS public.admin_parq_retention_preview(integer);
CREATE FUNCTION public.admin_parq_retention_preview(p_months integer DEFAULT NULL)
RETURNS TABLE (customers integer, parq_rows integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_months integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;
  v_months := _parq_retention_months(p_months);
  IF v_months IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT COUNT(DISTINCT s.id)::integer, COUNT(p.id)::integer
      FROM _stale_parq_customers((CURRENT_DATE - make_interval(months => v_months))::date) AS s(id)
      JOIN parq p ON p.customer_id = s.id AND p.anonymised_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_parq_retention_preview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_parq_retention_preview(integer) TO authenticated;

-- "Delete my health info now" — ignores the retention period.
DROP FUNCTION IF EXISTS public.admin_anonymise_customer_parq(integer);
CREATE FUNCTION public.admin_anonymise_customer_parq(p_customer_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;
  v_n := _clear_parq_for_customer(p_customer_id);
  INSERT INTO data_protection_log (action, customer_id, parq_rows)
  VALUES ('admin_anonymise_parq', p_customer_id, v_n);
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_anonymise_customer_parq(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_anonymise_customer_parq(integer) TO authenticated;

-- "What do you hold on me?" — one JSON document with everything, including
-- tables the admin can't otherwise read (waitlist_requests, pending_bookings).
DROP FUNCTION IF EXISTS public.admin_export_customer(integer);
CREATE FUNCTION public.admin_export_customer(p_customer_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_out   jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT email INTO v_email FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'customer', (SELECT to_jsonb(c) FROM customers c WHERE c.id = p_customer_id),
    'bookings', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) || jsonb_build_object(
               'class_name', cl.name, 'block_start', bl.start_date, 'block_end', bl.end_date)
             ORDER BY b.id)
        FROM bookings b
        LEFT JOIN classes cl ON cl.id = b.class_id
        LEFT JOIN blocks  bl ON bl.id = b.block_id
       WHERE b.customer_id = p_customer_id), '[]'::jsonb),
    'health_forms', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM parq p
       WHERE p.customer_id = p_customer_id), '[]'::jsonb),
    'cancellations', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM cancellations x
       WHERE x.customer_id = p_customer_id OR lower(x.email) = lower(v_email)), '[]'::jsonb),
    'waiting_lists', COALESCE((
      SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id) FROM waitlist w
       WHERE w.customer_id = p_customer_id), '[]'::jsonb),
    'waiting_list_requests', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) - 'token' ORDER BY r.id) FROM waitlist_requests r
       WHERE lower(r.email) = lower(v_email)), '[]'::jsonb),
    'pending_card_payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(pb)) FROM pending_bookings pb
       WHERE lower(pb.email) = lower(v_email)), '[]'::jsonb),
    'catch_up_swaps', COALESCE((
      SELECT jsonb_agg(to_jsonb(s)) FROM catch_up_swaps s
       WHERE s.customer_id = p_customer_id), '[]'::jsonb),
    'class_priority', COALESCE((
      SELECT jsonb_agg(to_jsonb(cp)) FROM customer_class_priority cp
       WHERE cp.customer_id = p_customer_id), '[]'::jsonb),
    'terms_agreed', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('version', t.version, 'kind', t.kind, 'text', t.body)
             ORDER BY t.version)
        FROM terms_versions t
       WHERE t.version IN (
         SELECT terms_version FROM bookings WHERE customer_id = p_customer_id
         UNION SELECT declaration_version FROM parq WHERE customer_id = p_customer_id
         UNION SELECT health_consent_version FROM parq WHERE customer_id = p_customer_id)), '[]'::jsonb)
  ) INTO v_out;

  INSERT INTO data_protection_log (action, customer_id) VALUES ('admin_export_customer', p_customer_id);
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_export_customer(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_customer(integer) TO authenticated;

-- Full delete. Same signature as migration 21, so CREATE OR REPLACE keeps
-- its grants. Now also removes the rows matched by email that it used to
-- leave behind (pending_bookings: expired attempts only). Cancellations are
-- deliberately KEPT (financial records).
CREATE OR REPLACE FUNCTION public.admin_delete_customer(p_customer_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_parq  integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT email INTO v_email FROM customers WHERE id = p_customer_id;

  DELETE FROM parq     WHERE customer_id = p_customer_id;
  GET DIAGNOSTICS v_parq = ROW_COUNT;
  DELETE FROM bookings WHERE customer_id = p_customer_id;
  DELETE FROM waitlist WHERE customer_id = p_customer_id;
  IF v_email IS NOT NULL THEN
    DELETE FROM waitlist_requests WHERE lower(email) = lower(v_email);
    -- Only EXPIRED card attempts: a live one may be mid-Stripe-checkout, and
    -- deleting it would let the card be charged with nothing to confirm.
    DELETE FROM pending_bookings  WHERE lower(email) = lower(v_email) AND expires_at < now();
  END IF;
  DELETE FROM customers WHERE id = p_customer_id;

  INSERT INTO data_protection_log (action, customer_id, parq_rows)
  VALUES ('admin_delete_customer', p_customer_id, v_parq);
END;
$$;

-- ------------------------------------------------------------
-- H. Nightly job — after the 03:00 and 03:10 clean-ups.
-- Does nothing until settings.parq_retention_months exists.
-- cron.schedule keys on jobname, so re-running this is safe.
-- ------------------------------------------------------------
SELECT cron.schedule(
  'anonymise-stale-parq',
  '20 3 * * *',
  $$SELECT public.anonymise_stale_parq()$$
);
