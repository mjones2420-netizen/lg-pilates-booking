-- ============================================================
-- Migration 33: Waiting-list email confirmation (issue #110, option C)
-- Target: lg-pilates-test (ngzfhamjuviwfwuncrjo) AND production
--         (mrlooyixnlxzcfmvnqme) — apply to TEST first, PROD on approval.
-- Re-runnable: idempotent (IF EXISTS / IF NOT EXISTS / DROP + CREATE).
--
-- WHY
-- #106 throttles the public join to 10 per IP per hour, but a waiting list
-- is capped at the class size (~10-12), so one connection could still fill a
-- list with fake names in about an hour — and under migration 28's
-- reservation rule every freed seat then stays hidden from real customers.
--
-- WHAT CHANGES
-- Joining becomes two steps. Filling in the form only creates a REQUEST in
-- `waitlist_requests` and emails a confirmation link. Until that link is
-- clicked the request is invisible: no seat held, not on the card, not on
-- Louise's page, no alert to Louise. Clicking the link runs
-- confirm_waitlist_request, which re-checks everything under the block lock
-- and only then adds the real `waitlist` row. Queue position counts from
-- confirmation. A fake name now needs a real inbox per entry.
--
-- The link lasts 24 hours (a resend restarts the clock and keeps the first
-- details); unclicked requests are deleted nightly.
--
-- join_waitlist (migration 28/30) is unchanged and stays service-role only.
-- The public Edge Function no longer calls it; tests use it to seed queues.
--
-- Error codes (front end string-matches these):
--   request_waitlist_join ... WL_MISSING_FIELDS, WL_BLOCK_NOT_FOUND,
--                             WL_NOT_FULL, WL_LIST_FULL, WL_ALREADY_BOOKED,
--                             WL_DUPLICATE, WL_RESEND_LIMIT
--   confirm_waitlist_request  returns an `outcome` instead of raising, so the
--                             landing page can explain each case:
--                             joined | already | expired | invalid |
--                             block_gone | space_free | list_full |
--                             already_booked
--
-- LOCK ORDER (deadlock avoidance, same rule as migration 28): `blocks` row
-- FIRST, then `waitlist_requests` / `waitlist`.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. waitlist_requests — pending, unconfirmed joins
-- ------------------------------------------------------------
-- Holds the details typed into the form until the email owner confirms.
-- No anon or authenticated access at all: only the SECURITY DEFINER
-- functions below (and service role) touch it. Louise never sees it.

CREATE TABLE IF NOT EXISTS public.waitlist_requests (
  id            SERIAL PRIMARY KEY,
  block_id      BIGINT NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  token         UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  send_count    INTEGER NOT NULL DEFAULT 1,
  confirmed_at  TIMESTAMPTZ,
  waitlist_id   INTEGER REFERENCES public.waitlist(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_requests_token_unique
  ON public.waitlist_requests (token);

-- One live (unconfirmed) request per email per block. A second submit is a
-- resend of the same request, not a new one.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_requests_pending_unique
  ON public.waitlist_requests (block_id, lower(email))
  WHERE confirmed_at IS NULL;

ALTER TABLE public.waitlist_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.waitlist_requests TO service_role;
REVOKE ALL ON SEQUENCE public.waitlist_requests_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.waitlist_requests_id_seq TO service_role;

-- ------------------------------------------------------------
-- 2. request_waitlist_join — service role only (join-waitlist-throttled)
-- ------------------------------------------------------------
-- Same pre-checks as join_waitlist, so a customer hears "you're already on
-- it" / "you've already got a place" straight away rather than after the
-- email round trip. Does NOT call upsert_customer: nothing about the
-- customer list changes until the email owner confirms.
--
-- Returns the request id only. The token never goes back to the caller —
-- if it did, the browser could confirm without the email and the whole
-- point would be lost. The Edge Function hands the id to send-email, which
-- reads the token server-side.

DROP FUNCTION IF EXISTS public.request_waitlist_join(bigint, text, text, text, text);

CREATE FUNCTION public.request_waitlist_join(
  p_block_id   bigint,
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_phone      text
)
RETURNS TABLE (request_id integer, is_resend boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Initial email plus three resends.
  c_max_sends     CONSTANT INTEGER := 4;
  v_cap           INTEGER;
  v_booked        INTEGER;
  v_wait          INTEGER;
  v_end_date      DATE;
  v_visible       BOOLEAN;
  v_customer_id   INTEGER;
  v_req_id        INTEGER;
  v_req_expires   TIMESTAMPTZ;
  v_req_sends     INTEGER;
BEGIN
  IF p_block_id IS NULL OR COALESCE(TRIM(p_email), '') = '' THEN
    RAISE EXCEPTION 'WL_MISSING_FIELDS';
  END IF;

  SELECT cap, COALESCE(booked, 0), end_date, COALESCE(visible, true)
    INTO v_cap, v_booked, v_end_date, v_visible
    FROM blocks
   WHERE id = p_block_id
     FOR UPDATE;

  IF NOT FOUND OR v_end_date < CURRENT_DATE OR NOT v_visible THEN
    RAISE EXCEPTION 'WL_BLOCK_NOT_FOUND';
  END IF;

  SELECT COUNT(*) INTO v_wait FROM waitlist WHERE block_id = p_block_id;

  IF (v_booked + v_wait) < v_cap THEN
    RAISE EXCEPTION 'WL_NOT_FULL';
  END IF;
  IF v_wait >= v_cap THEN
    RAISE EXCEPTION 'WL_LIST_FULL';
  END IF;

  SELECT id INTO v_customer_id
    FROM customers WHERE LOWER(email) = LOWER(p_email) LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM bookings
                WHERE block_id = p_block_id
                  AND customer_id = v_customer_id
                  AND status != 'cancelled') THEN
      RAISE EXCEPTION 'WL_ALREADY_BOOKED';
    END IF;
    IF EXISTS (SELECT 1 FROM waitlist
                WHERE block_id = p_block_id AND customer_id = v_customer_id) THEN
      RAISE EXCEPTION 'WL_DUPLICATE';
    END IF;
  END IF;

  SELECT id, expires_at, send_count
    INTO v_req_id, v_req_expires, v_req_sends
    FROM waitlist_requests
   WHERE block_id = p_block_id
     AND LOWER(email) = LOWER(p_email)
     AND confirmed_at IS NULL
     FOR UPDATE;

  IF v_req_id IS NOT NULL AND v_req_expires < now() THEN
    -- A stale request is just replaced: a fresh form, a fresh link.
    DELETE FROM waitlist_requests WHERE id = v_req_id;
    v_req_id := NULL;
  END IF;

  IF v_req_id IS NOT NULL THEN
    -- A resend. Same token, so a link from an earlier email still works,
    -- and the clock restarts. The ORIGINAL details are kept: anyone can
    -- submit the form with someone else's email, so a resend must not be a
    -- way to swap the name/phone a brand-new customer is created from.
    -- Capped, so the form can't send someone an endless stream of emails.
    IF v_req_sends >= c_max_sends THEN
      RAISE EXCEPTION 'WL_RESEND_LIMIT';
    END IF;
    UPDATE waitlist_requests
       SET send_count = send_count + 1,
           expires_at = now() + interval '24 hours'
     WHERE id = v_req_id;
    RETURN QUERY SELECT v_req_id, true;
    RETURN;
  END IF;

  INSERT INTO waitlist_requests (block_id, first_name, last_name, email, phone)
  VALUES (p_block_id, TRIM(p_first_name), TRIM(p_last_name), TRIM(p_email), TRIM(p_phone))
  RETURNING id INTO v_req_id;

  RETURN QUERY SELECT v_req_id, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_waitlist_join(bigint, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_waitlist_join(bigint, text, text, text, text) TO service_role;

-- ------------------------------------------------------------
-- 3. confirm_waitlist_request — anon, token-gated
-- ------------------------------------------------------------
-- The token is 122 bits of randomness that only went to the email owner,
-- same posture as get_offer_details. Everything is re-checked here under
-- the block lock: the block may have filled, emptied or ended since the
-- form was sent.
--
-- An EXISTING customer is used as they are — the name and phone in the
-- request are ignored. Whoever filled in the form may not be the email
-- owner, and clicking a link must never rewrite someone's stored phone.
-- Only a brand-new email is created, as 'new', from the request details.
--
-- space_free leaves the request unconfirmed: they are pointed at the Book
-- button instead, and if the block fills again before they book, the same
-- link still works.

DROP FUNCTION IF EXISTS public.confirm_waitlist_request(uuid);

CREATE FUNCTION public.confirm_waitlist_request(p_token uuid)
RETURNS TABLE (
  outcome        text,
  queue_position integer,
  waitlist_id    integer,
  block_id       bigint,
  class_id       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req          waitlist_requests%ROWTYPE;
  v_cap          INTEGER;
  v_booked       INTEGER;
  v_end_date     DATE;
  v_visible      BOOLEAN;
  v_class_id     BIGINT;
  v_wait         INTEGER;
  v_customer_id  INTEGER;
  v_wl_id        INTEGER;
BEGIN
  IF p_token IS NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::int, NULL::int, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  -- Unlocked peek just to learn the block, so the block can be locked first.
  SELECT * INTO v_req FROM waitlist_requests r WHERE r.token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::int, NULL::int, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  SELECT b.cap, COALESCE(b.booked, 0), b.end_date, COALESCE(b.visible, true), b.class_id
    INTO v_cap, v_booked, v_end_date, v_visible, v_class_id
    FROM blocks b
   WHERE b.id = v_req.block_id
     FOR UPDATE;

  IF NOT FOUND OR v_end_date < CURRENT_DATE OR NOT v_visible THEN
    RETURN QUERY SELECT 'block_gone'::text, NULL::int, NULL::int, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  -- Re-read under lock: a parallel click may have confirmed it already.
  SELECT * INTO v_req FROM waitlist_requests r WHERE r.id = v_req.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::int, NULL::int, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  IF v_req.confirmed_at IS NOT NULL THEN
    -- Position only while they are still on the list (they may have since
    -- booked, or been removed — the FK then nulls waitlist_id).
    RETURN QUERY
      SELECT 'already'::text,
             CASE WHEN v_req.waitlist_id IS NOT NULL THEN
               (SELECT COUNT(*)::int FROM waitlist w
                 WHERE w.block_id = v_req.block_id AND w.id <= v_req.waitlist_id)
             END,
             v_req.waitlist_id, v_req.block_id, v_class_id;
    RETURN;
  END IF;

  IF v_req.expires_at < now() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::int, NULL::int, v_req.block_id, v_class_id;
    RETURN;
  END IF;

  SELECT c.id INTO v_customer_id
    FROM customers c WHERE LOWER(c.email) = LOWER(v_req.email) LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM bookings bk
                WHERE bk.block_id = v_req.block_id
                  AND bk.customer_id = v_customer_id
                  AND bk.status != 'cancelled') THEN
      RETURN QUERY SELECT 'already_booked'::text, NULL::int, NULL::int, v_req.block_id, v_class_id;
      RETURN;
    END IF;
    SELECT w.id INTO v_wl_id FROM waitlist w
     WHERE w.block_id = v_req.block_id AND w.customer_id = v_customer_id;
    IF v_wl_id IS NOT NULL THEN
      -- Already queued another way (e.g. Louise, or an older request).
      UPDATE waitlist_requests SET confirmed_at = now(), waitlist_id = v_wl_id WHERE id = v_req.id;
      RETURN QUERY
        SELECT 'already'::text,
               (SELECT COUNT(*)::int FROM waitlist w
                 WHERE w.block_id = v_req.block_id AND w.id <= v_wl_id),
               v_wl_id, v_req.block_id, v_class_id;
      RETURN;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_wait FROM waitlist w WHERE w.block_id = v_req.block_id;

  IF (v_booked + v_wait) < v_cap THEN
    RETURN QUERY SELECT 'space_free'::text, NULL::int, NULL::int, v_req.block_id, v_class_id;
    RETURN;
  END IF;
  IF v_wait >= v_cap THEN
    RETURN QUERY SELECT 'list_full'::text, NULL::int, NULL::int, v_req.block_id, v_class_id;
    RETURN;
  END IF;

  IF v_customer_id IS NULL THEN
    v_customer_id := upsert_customer(
      v_req.first_name, v_req.last_name, v_req.email, v_req.phone, 'new'
    );
  END IF;

  INSERT INTO waitlist (block_id, customer_id, status)
  VALUES (v_req.block_id, v_customer_id, 'waiting')
  RETURNING id INTO v_wl_id;

  UPDATE waitlist_requests SET confirmed_at = now(), waitlist_id = v_wl_id WHERE id = v_req.id;

  RETURN QUERY
    SELECT 'joined'::text,
           (SELECT COUNT(*)::int FROM waitlist w
             WHERE w.block_id = v_req.block_id AND w.id <= v_wl_id),
           v_wl_id, v_req.block_id, v_class_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_waitlist_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_waitlist_request(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.confirm_waitlist_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_waitlist_request(uuid) TO service_role;

-- ------------------------------------------------------------
-- 4. Nightly clean-up
-- ------------------------------------------------------------
-- Unclicked requests go a day after their link expired (the grace day means
-- a click just after expiry still gets "this link has expired" rather than
-- "not valid"). Confirmed ones are kept while their waiting-list place
-- exists, so a click on the old email still says "you're already on the
-- list, number N"; once the place is gone (booked or removed, which nulls
-- waitlist_id) they go after a week. cron.schedule keys on jobname, so
-- re-running this updates the job in place.

SELECT cron.schedule(
  'cleanup-waitlist-requests',
  '10 3 * * *',  -- every day at 03:10
  $$DELETE FROM public.waitlist_requests
     WHERE (confirmed_at IS NULL AND expires_at < now() - interval '1 day')
        OR (confirmed_at < now() - interval '7 days' AND waitlist_id IS NULL)$$
);

COMMIT;
