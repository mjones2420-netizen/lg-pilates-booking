-- Migration 26: booking_confirmed_for_session RPC (#6 — correct post-payment screen)
--
-- After a Stripe card payment the browser is redirected back with
-- ?payment=success. Today it ALWAYS shows a "Confirmed" screen — but the actual
-- booking runs asynchronously in stripe-webhook (book_if_available) and can fail
-- (CLASS_FULL / ALREADY_BOOKED) if the block filled in the seconds while the
-- customer was paying. So a customer with no place is told it's "secured".
--
-- The fix: on return, the browser polls this RPC with its Stripe checkout
-- session id (carried across the redirect via the {CHECKOUT_SESSION_ID}
-- template Stripe substitutes into success_url). It returns TRUE once a
-- confirmed booking exists for that session, FALSE while it doesn't. The
-- browser shows the green "confirmed" screen only on TRUE, and an honest
-- "payment received but we couldn't secure your place" screen if it's still
-- FALSE after a short poll window.
--
-- Anon-callable (the public booking page is anon). SECURITY DEFINER because
-- anon has no SELECT on bookings (RLS). Returns only a boolean — no PII, no row
-- data. The session id is a high-entropy Stripe token (cs_...) the caller
-- already holds for their own checkout, so a boolean lookup leaks nothing.
--
-- Apply to TEST (ngzfhamjuviwfwuncrjo) first, then PRODUCTION
-- (mrlooyixnlxzcfmvnqme) after the suite is green and Mark confirms.

CREATE OR REPLACE FUNCTION public.booking_confirmed_for_session(p_session_id text)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM bookings
    WHERE stripe_checkout_session_id = p_session_id
      AND status = 'confirmed'
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.booking_confirmed_for_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_confirmed_for_session(text) TO anon;
