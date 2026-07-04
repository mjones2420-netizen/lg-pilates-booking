-- Migration 20: Real admin gate in the database (#55)
-- Today every RLS policy that says "TO authenticated USING (true)" trusts
-- ANY logged-in account with full admin rights. #43 closes the public
-- signup door at the Auth level; this migration adds the belt to that
-- braces at the database level: only accounts listed in admin_users get
-- anything, no matter how an account came to exist.

-- PART A: admin_users table (locked down — no direct access, not even by
-- authenticated users; the only way in is through is_admin() below).
CREATE TABLE public.admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies — RLS with zero policies means nobody (anon or
-- authenticated) can read/write this table directly. is_admin() reads it
-- via SECURITY DEFINER, which bypasses RLS for the function owner.

REVOKE ALL ON public.admin_users FROM anon, authenticated;

-- Seed the current admin: test project's admin@lg-pilates-test.local.
INSERT INTO public.admin_users (user_id)
VALUES ('805a6901-b6d3-42e5-bb74-8a2a8c09d179')
ON CONFLICT DO NOTHING;

-- PART B: is_admin() helper
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
-- Supabase grants EXECUTE on new public-schema functions to anon by default
-- (ALTER DEFAULT PRIVILEGES) — REVOKE FROM PUBLIC doesn't touch that
-- explicit per-role grant, so revoke it directly too.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- PART C: rewrite every "TO authenticated USING (true)" policy to gate on
-- is_admin() instead. Grants stay broad (GRANT ALL ... TO authenticated) —
-- the policies do the gating, matching the pattern used everywhere else
-- in this schema.

-- classes
ALTER POLICY "admin_insert_classes" ON public.classes WITH CHECK (is_admin());
ALTER POLICY "admin_update_classes" ON public.classes USING (is_admin());
ALTER POLICY "admin_delete_classes" ON public.classes USING (is_admin());

-- blocks
ALTER POLICY "admin_insert_blocks" ON public.blocks WITH CHECK (is_admin());
ALTER POLICY "admin_update_blocks" ON public.blocks USING (is_admin());
ALTER POLICY "admin_delete_blocks" ON public.blocks USING (is_admin());

-- bookings
ALTER POLICY "admin_view_bookings" ON public.bookings USING (is_admin());
ALTER POLICY "admin_update_bookings" ON public.bookings USING (is_admin());
ALTER POLICY "admin_delete_bookings" ON public.bookings USING (is_admin());

-- customers
ALTER POLICY "admin_view_customers" ON public.customers USING (is_admin());
ALTER POLICY "admin_update_customers" ON public.customers USING (is_admin());
ALTER POLICY "admin_delete_customers" ON public.customers USING (is_admin());

-- parq
ALTER POLICY "admin_view_parq" ON public.parq USING (is_admin());
ALTER POLICY "admin_delete_parq" ON public.parq USING (is_admin());

-- settings
ALTER POLICY "admin_insert_settings" ON public.settings WITH CHECK (is_admin());
ALTER POLICY "admin_update_settings" ON public.settings USING (is_admin());

-- admin-only tables (FOR ALL — both USING and WITH CHECK)
ALTER POLICY "admin_all_cancellations" ON public.cancellations USING (is_admin()) WITH CHECK (is_admin());
ALTER POLICY "admin_all_customer_class_priority" ON public.customer_class_priority USING (is_admin()) WITH CHECK (is_admin());
ALTER POLICY "admin_all_waitlist" ON public.waitlist USING (is_admin()) WITH CHECK (is_admin());
ALTER POLICY "admin_all_catch_up_swaps" ON public.catch_up_swaps USING (is_admin()) WITH CHECK (is_admin());

-- pending_bookings (dashboard-side policies; the Stripe edge functions use
-- the service-role key and never go through RLS)
ALTER POLICY "service_select_pending_bookings" ON public.pending_bookings USING (is_admin());
ALTER POLICY "service_delete_pending_bookings" ON public.pending_bookings USING (is_admin());
