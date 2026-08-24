-- ============================================================
-- Migration 28: Waiting-list feature (issue #72, part 1/5 of #71)
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to TEST first, PROD on approval.
-- Re-runnable: idempotent (IF EXISTS / IF NOT EXISTS / CREATE OR REPLACE).
--
-- NOTE ON NUMBERING: issue #72's title says "Migration 25". That was written
-- in session 63, before 25/26/27 were taken by #78, #6a and #35. This is 28.
--
-- WHAT THIS DOES
-- The `waitlist` table has existed since migration 01 as unused scaffolding
-- (id / class_id / customer_id / created_at, zero rows on both projects —
-- verified before writing this). It is RESHAPED here, not rebuilt: a waiting
-- list belongs to a BLOCK (a specific dated term), not to a class.
--
-- THE RESERVATION RULE (the core idea)
-- Public spaces = cap - booked - (everyone on the list), floored at 0. So
-- while anybody is waiting, a freed space is INVISIBLE to the public — it is
-- held for the list. Louise hands it out explicitly via offer_waitlist_space,
-- which mints a single-use token emailed to that one person. That token is
-- the ONLY way past the "full" gate, and it is checked against the block AND
-- the customer, so a leaked link cannot be used by anyone else.
--
-- Enforcement always uses a live COUNT under the block row lock. The
-- trigger-maintained blocks.wait column is DISPLAY ONLY — never trusted as
-- the gate (same posture as blocks.booked).
--
-- Error codes (front end string-matches these):
--   join_waitlist ......... WL_MISSING_FIELDS, WL_BLOCK_NOT_FOUND, WL_NOT_FULL,
--                           WL_LIST_FULL, WL_ALREADY_BOOKED, WL_DUPLICATE
--                           (WL_BLOCK_NOT_FOUND also covers an ended or hidden
--                            block — deliberately indistinguishable)
--   offer_waitlist_space .. WL_NOT_FOUND, WL_ALREADY_OFFERED, WL_NO_SPACE
--   release_waitlist_hold . WL_NOT_FOUND, WL_NOT_OFFERED
--   book_if_available ..... WL_BAD_TOKEN, WL_TOKEN_MISMATCH
--                           (plus existing CLASS_FULL / ALREADY_BOOKED /
--                            BLOCK_NOT_FOUND / CLASS_MISMATCH)
--
-- WL_NO_SPACE is an addition beyond issue #72's checklist. Without it an
-- admin could mint two holds against one physical seat; both people would be
-- emailed "book now" and the second would hit CLASS_FULL after being told the
-- space was theirs. Same reasoning as #59 — the DB is the gate, not the UI.
--
-- LOCK ORDER (deadlock avoidance): every function that touches both takes the
-- `blocks` row FIRST, then `waitlist`. Keep it that way.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Reshape `waitlist`
-- ------------------------------------------------------------

-- class_id goes: the list belongs to a block, not a class.
ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS waitlist_class_id_fkey;
ALTER TABLE public.waitlist DROP COLUMN IF EXISTS class_id;

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS block_id             BIGINT,
  ADD COLUMN IF NOT EXISTS status               TEXT NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS offer_token          UUID,
  ADD COLUMN IF NOT EXISTS offered_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS joined_alert_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_email_sent_at  TIMESTAMPTZ;

-- Safe: table is empty on both projects (checked). A row with no block or no
-- customer is meaningless, and NULLs would defeat the UNIQUE pair below.
ALTER TABLE public.waitlist ALTER COLUMN block_id    SET NOT NULL;
ALTER TABLE public.waitlist ALTER COLUMN customer_id SET NOT NULL;

-- The list dies with its block, and with the customer.
ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS waitlist_block_id_fkey;
ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_block_id_fkey
  FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;

ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS waitlist_customer_id_fkey;
ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS waitlist_status_check;
ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_status_check CHECK (status IN ('waiting', 'offered'));

-- One place on the list per person per block.
ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS waitlist_unique_block_customer;
ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_unique_block_customer UNIQUE (block_id, customer_id);

-- Tokens are unique when present; released holds set the column back to NULL,
-- so this must be a PARTIAL index (many NULLs are expected).
DROP INDEX IF EXISTS waitlist_offer_token_unique;
CREATE UNIQUE INDEX waitlist_offer_token_unique
  ON public.waitlist (offer_token) WHERE offer_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS waitlist_block_id_idx ON public.waitlist (block_id);

-- Stripe pass-through: the token has to survive the round trip to Checkout.
ALTER TABLE public.pending_bookings ADD COLUMN IF NOT EXISTS offer_token UUID;

-- ------------------------------------------------------------
-- 2. blocks.wait trigger (display only)
-- ------------------------------------------------------------
-- Recomputes from a live COUNT rather than incrementing, so the column
-- self-heals if anything ever writes the table directly. Mirrors
-- sync_block_booked_count().

CREATE OR REPLACE FUNCTION public.sync_block_wait_count()
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
     SET wait = (SELECT COUNT(*) FROM waitlist WHERE block_id = v_block_id)
   WHERE id = v_block_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

-- #44 hygiene: trigger functions are invoked internally and need no EXECUTE
-- grant on the invoking role.
REVOKE ALL ON FUNCTION public.sync_block_wait_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_block_wait_count() FROM anon;
REVOKE ALL ON FUNCTION public.sync_block_wait_count() FROM authenticated;

DROP TRIGGER IF EXISTS trg_sync_block_wait_count ON public.waitlist;
CREATE TRIGGER trg_sync_block_wait_count
  AFTER INSERT OR DELETE ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.sync_block_wait_count();

-- ------------------------------------------------------------
-- 3. join_waitlist — public path (anon)
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.join_waitlist(bigint, text, text, text, text);

CREATE FUNCTION public.join_waitlist(
  p_block_id   bigint,
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_phone      text
)
-- `queue_position`, not `position`: POSITION is a SQL function name and makes
-- an unhelpful mess as an OUT parameter.
RETURNS TABLE (waitlist_id integer, queue_position integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cap           INTEGER;
  v_booked        INTEGER;
  v_wait          INTEGER;
  v_end_date      DATE;
  v_visible       BOOLEAN;
  v_customer_id   INTEGER;
  v_customer_type TEXT;
  v_existing      INTEGER;
  v_new_id        INTEGER;
BEGIN
  IF p_block_id IS NULL OR COALESCE(TRIM(p_email), '') = '' THEN
    RAISE EXCEPTION 'WL_MISSING_FIELDS';
  END IF;

  -- Lock the block first (see LOCK ORDER note at the top).
  SELECT cap, COALESCE(booked, 0), end_date, COALESCE(visible, true)
    INTO v_cap, v_booked, v_end_date, v_visible
    FROM blocks
   WHERE id = p_block_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WL_BLOCK_NOT_FOUND';
  END IF;

  -- A finished or hidden block has no public "Join" button, so a call naming
  -- one did not come from the booking page. Without this an ended block stays
  -- a permanently joinable target for generating admin alerts.
  IF v_end_date < CURRENT_DATE OR NOT v_visible THEN
    RAISE EXCEPTION 'WL_BLOCK_NOT_FOUND';
  END IF;

  -- You may only join when the block presents as FULL to the public, which
  -- under the reservation rule means booked + waiting has reached cap. If a
  -- public space is genuinely available, they should just book it.
  SELECT COUNT(*) INTO v_wait FROM waitlist WHERE block_id = p_block_id;

  IF (v_booked + v_wait) < v_cap THEN
    RAISE EXCEPTION 'WL_NOT_FULL';
  END IF;

  -- Bound the list. This RPC is anon-callable, and under the reservation rule
  -- every row removes a space from public sale — an unbounded list would let
  -- anyone lock a class out of public booking for good (and fire one admin
  -- alert per row). A list longer than the class itself is not a real queue.
  -- NOTE: this caps the damage, it does not stop it. A proper per-IP throttle
  -- in front of this RPC is still needed before the feature goes live —
  -- see the follow-up issue linked from #71.
  IF v_wait >= v_cap THEN
    RAISE EXCEPTION 'WL_LIST_FULL';
  END IF;

  -- Reuses the existing customer identity path (email is the match key,
  -- name-locked since #48). Pass the EXISTING customer_type straight back so
  -- upsert_customer cannot change it: joining a waiting list must never
  -- relabel someone Louise has already classified (a 'new' client would lose
  -- their PAR-Q prompt). Only a genuinely unknown email starts as 'new'.
  SELECT id, customer_type INTO v_customer_id, v_customer_type
    FROM customers WHERE LOWER(email) = LOWER(p_email) LIMIT 1;

  v_customer_id := upsert_customer(
    p_first_name, p_last_name, p_email, p_phone,
    COALESCE(v_customer_type, 'new')
  );

  SELECT COUNT(*) INTO v_existing
    FROM bookings
   WHERE block_id    = p_block_id
     AND customer_id = v_customer_id
     AND status     != 'cancelled';

  IF v_existing > 0 THEN
    RAISE EXCEPTION 'WL_ALREADY_BOOKED';
  END IF;

  INSERT INTO waitlist (block_id, customer_id, status)
  VALUES (p_block_id, v_customer_id, 'waiting')
  RETURNING id INTO v_new_id;

  RETURN QUERY
    SELECT v_new_id,
           (SELECT COUNT(*)::int FROM waitlist
             WHERE block_id = p_block_id AND id <= v_new_id);

EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%waitlist_unique_block_customer%' THEN
      RAISE EXCEPTION 'WL_DUPLICATE';
    ELSE
      RAISE;
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_waitlist(bigint, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waitlist(bigint, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.join_waitlist(bigint, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_waitlist(bigint, text, text, text, text) TO service_role;

-- ------------------------------------------------------------
-- 4. offer_waitlist_space — admin only
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.offer_waitlist_space(integer);

CREATE FUNCTION public.offer_waitlist_space(p_waitlist_id integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_block_id  BIGINT;
  v_status    TEXT;
  v_cap       INTEGER;
  v_booked    INTEGER;
  v_offered   INTEGER;
  v_token     UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT block_id INTO v_block_id FROM waitlist WHERE id = p_waitlist_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WL_NOT_FOUND';
  END IF;

  -- Lock order: block, then the waitlist row.
  SELECT cap, COALESCE(booked, 0)
    INTO v_cap, v_booked
    FROM blocks
   WHERE id = v_block_id
     FOR UPDATE;

  SELECT status INTO v_status FROM waitlist WHERE id = p_waitlist_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Removed between the two SELECTs; without this we would mint and return a
    -- token that the UPDATE below silently fails to store.
    RAISE EXCEPTION 'WL_NOT_FOUND';
  END IF;

  IF v_status = 'offered' THEN
    RAISE EXCEPTION 'WL_ALREADY_OFFERED';
  END IF;

  -- Every live hold is a promise on a physical seat. Two holds against one
  -- free seat would mean telling two people a space is theirs.
  SELECT COUNT(*) INTO v_offered
    FROM waitlist
   WHERE block_id = v_block_id AND status = 'offered';

  IF (v_booked + v_offered) >= v_cap THEN
    RAISE EXCEPTION 'WL_NO_SPACE';
  END IF;

  v_token := gen_random_uuid();

  UPDATE waitlist
     SET status              = 'offered',
         offer_token         = v_token,
         offered_at          = NOW(),
         -- Cleared so the one-shot email stamp is per OFFER, not per row:
         -- release + re-offer must be able to send a fresh email.
         offer_email_sent_at = NULL
   WHERE id = p_waitlist_id;

  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.offer_waitlist_space(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offer_waitlist_space(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.offer_waitlist_space(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.offer_waitlist_space(integer) TO service_role;

-- ------------------------------------------------------------
-- 5. release_waitlist_hold — admin only
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.release_waitlist_hold(integer);

CREATE FUNCTION public.release_waitlist_hold(p_waitlist_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT status INTO v_status FROM waitlist WHERE id = p_waitlist_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WL_NOT_FOUND';
  END IF;

  IF v_status <> 'offered' THEN
    RAISE EXCEPTION 'WL_NOT_OFFERED';
  END IF;

  -- Clearing offer_token kills the emailed link immediately.
  UPDATE waitlist
     SET status              = 'waiting',
         offer_token         = NULL,
         offered_at          = NULL,
         offer_email_sent_at = NULL
   WHERE id = p_waitlist_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_waitlist_hold(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_waitlist_hold(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_waitlist_hold(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_waitlist_hold(integer) TO service_role;

-- ------------------------------------------------------------
-- 6. get_offer_details — anon, token-gated prefill
-- ------------------------------------------------------------
-- Returns PII, but only to a caller holding the 122-bit random token that was
-- emailed to that person — same posture as a password-reset link. Returns
-- zero rows for anything that is not a LIVE offered hold (bad token, already
-- booked, released, block deleted), which the front end shows as a polite
-- "this link is no longer valid" toast.

DROP FUNCTION IF EXISTS public.get_offer_details(uuid);

CREATE FUNCTION public.get_offer_details(p_token uuid)
RETURNS TABLE (
  waitlist_id integer,
  block_id    bigint,
  class_id    bigint,
  first_name  text,
  last_name   text,
  email       text,
  phone       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.id, w.block_id, b.class_id, c.first_name, c.last_name, c.email, c.phone
    FROM waitlist w
    JOIN blocks    b ON b.id = w.block_id
    JOIN customers c ON c.id = w.customer_id
   WHERE w.offer_token = p_token
     AND w.status      = 'offered'
     AND p_token IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_offer_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_offer_details(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_offer_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_offer_details(uuid) TO service_role;

-- ------------------------------------------------------------
-- 7. book_if_available v3 — waitlist-aware
-- ------------------------------------------------------------
-- DROP + CREATE, not overload: a second 5-arg version alongside the 4-arg one
-- would make `rpc('book_if_available', {...})` ambiguous for existing callers.
-- DROP also destroys the ACL migration 17 relied on, so anon EXECUTE is
-- re-granted explicitly below — this is the public booking path.

DROP FUNCTION IF EXISTS public.book_if_available(bigint, bigint, bigint, numeric);
DROP FUNCTION IF EXISTS public.book_if_available(bigint, bigint, bigint, numeric, uuid);

CREATE FUNCTION public.book_if_available(
  p_block_id    bigint,
  p_class_id    bigint,
  p_customer_id bigint,
  p_amount_due  numeric,
  p_offer_token uuid DEFAULT NULL
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

  INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
  VALUES (v_class_id, p_block_id, p_customer_id, 'reserved', v_amount)
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

-- Re-grant explicitly: DROP destroyed the ACL. anon EXECUTE is required —
-- this is the public booking path (safe since #46 made it tamper-proof).
REVOKE ALL ON FUNCTION public.book_if_available(bigint, bigint, bigint, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_if_available(bigint, bigint, bigint, numeric, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.book_if_available(bigint, bigint, bigint, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_if_available(bigint, bigint, bigint, numeric, uuid) TO service_role;

-- ------------------------------------------------------------
-- 8. admin_delete_class — repair for the dropped class_id column
-- ------------------------------------------------------------
-- Migration 21's body runs `DELETE FROM waitlist WHERE class_id = ...`, which
-- would now fail at runtime. Deletes stay EXPLICIT and ordered rather than
-- leaning on cascades — see session 66: `bookings` has both a direct NO ACTION
-- FK to classes and an indirect CASCADE path via blocks, and Postgres does not
-- guarantee the cascade completes before the direct FK is checked.

CREATE OR REPLACE FUNCTION public.admin_delete_class(p_class_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  DELETE FROM waitlist
   WHERE block_id IN (SELECT id FROM blocks WHERE class_id = p_class_id);
  DELETE FROM bookings WHERE class_id = p_class_id;
  DELETE FROM classes  WHERE id = p_class_id;
END;
$function$;

-- ------------------------------------------------------------
-- 9. Resync blocks.wait (one-off, matches the trigger's definition)
-- ------------------------------------------------------------

UPDATE blocks b
   SET wait = (SELECT COUNT(*) FROM waitlist w WHERE w.block_id = b.id)
 WHERE b.wait IS DISTINCT FROM (SELECT COUNT(*) FROM waitlist w WHERE w.block_id = b.id);

-- ------------------------------------------------------------
-- 10. Table grants: unchanged on purpose
-- ------------------------------------------------------------
-- `waitlist` keeps RLS enabled with only the is_admin() policy from migration
-- 20, and NO anon table grants. The public reaches it exclusively through the
-- SECURITY DEFINER functions above, so SEC-07's anon grant matrix stays green.

COMMIT;
