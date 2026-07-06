-- Migration 24: Hide admin_email from the anon role (#38)
-- The settings table's SELECT policy was "public_view_settings" ON settings
-- FOR SELECT TO anon, authenticated USING (true) — so anyone with the public
-- anon key could read EVERY settings row, including admin_email (harvestable
-- for targeted spam/phishing). Migration 20 tightened settings INSERT/UPDATE to
-- is_admin() but deliberately left this anon SELECT policy untouched.
--
-- This migration makes the anon read row-level: the public site keeps the keys
-- it genuinely needs (bank details shown on the transfer screen, payment_mode,
-- and the stripe publishable key — all public by design), while admin_email is
-- restricted to a logged-in admin. Edge functions read settings with the
-- service-role key (bypasses RLS), so they are unaffected.

-- Anon SELECT: only the keys the public booking screen needs. admin_email is
-- excluded, so an anon SELECT * simply returns fewer rows (RLS filters silently,
-- no error).
DROP POLICY IF EXISTS "public_view_settings" ON public.settings;
CREATE POLICY "public_view_settings" ON public.settings
  FOR SELECT TO anon
  USING (key IN ('bank_name','bank_sort_code','bank_account_no',
                 'payment_mode','stripe_publishable_key'));

-- Admin SELECT: a real admin (is_admin(), from migration 20) sees ALL rows,
-- including admin_email. The old public_view_settings was "TO anon,
-- authenticated", so it previously doubled as the admin read path; now that it
-- is anon-only, authenticated needs its own SELECT policy.
DROP POLICY IF EXISTS "admin_view_settings" ON public.settings;
CREATE POLICY "admin_view_settings" ON public.settings
  FOR SELECT TO authenticated
  USING (is_admin());

-- The table-level GRANT SELECT ... TO anon (migration 06) stays as-is — it is
-- still required for anon to select the public rows at all; the policy above
-- now decides WHICH rows come back.
