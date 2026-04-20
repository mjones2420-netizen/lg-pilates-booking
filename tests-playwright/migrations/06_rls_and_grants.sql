-- Migration 06: RLS + Grants
-- Enable RLS, create 25 policies, tighten anon grants to minimum (Session 5 audit item 20).

-- PART A: Enable RLS on all 9 tables
ALTER TABLE public.classes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parq                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_class_priority ENABLE ROW LEVEL SECURITY;

-- PART B: Policies (25 total)

-- classes
CREATE POLICY "public_can_view_classes" ON public.classes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_insert_classes" ON public.classes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_classes" ON public.classes
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin_delete_classes" ON public.classes
  FOR DELETE TO authenticated USING (true);

-- blocks
CREATE POLICY "public_can_view_blocks" ON public.blocks
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_insert_blocks" ON public.blocks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_blocks" ON public.blocks
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin_delete_blocks" ON public.blocks
  FOR DELETE TO authenticated USING (true);

-- bookings (public INSERT only; admin SELECT/UPDATE/DELETE)
CREATE POLICY "public_create_booking" ON public.bookings
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_view_bookings" ON public.bookings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_update_bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin_delete_bookings" ON public.bookings
  FOR DELETE TO authenticated USING (true);

-- customers (public INSERT only; admin SELECT/UPDATE/DELETE)
CREATE POLICY "public_create_customer" ON public.customers
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_view_customers" ON public.customers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_update_customers" ON public.customers
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin_delete_customers" ON public.customers
  FOR DELETE TO authenticated USING (true);

-- parq (public INSERT only; admin SELECT/DELETE — NO UPDATE policy, write-once)
CREATE POLICY "public_insert_parq" ON public.parq
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_view_parq" ON public.parq
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_delete_parq" ON public.parq
  FOR DELETE TO authenticated USING (true);

-- settings (public SELECT, admin INSERT/UPDATE, no DELETE policy)
CREATE POLICY "public_view_settings" ON public.settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_insert_settings" ON public.settings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_settings" ON public.settings
  FOR UPDATE TO authenticated USING (true);

-- admin-only tables
CREATE POLICY "admin_all_waitlist" ON public.waitlist
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all_cancellations" ON public.cancellations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all_customer_class_priority" ON public.customer_class_priority
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PART C: Tighten anon grants to minimum (Session 5 audit item 20)

REVOKE ALL ON public.classes                 FROM anon;
REVOKE ALL ON public.blocks                  FROM anon;
REVOKE ALL ON public.bookings                FROM anon;
REVOKE ALL ON public.customers               FROM anon;
REVOKE ALL ON public.parq                    FROM anon;
REVOKE ALL ON public.settings                FROM anon;
REVOKE ALL ON public.waitlist                FROM anon;
REVOKE ALL ON public.cancellations           FROM anon;
REVOKE ALL ON public.customer_class_priority FROM anon;

REVOKE EXECUTE ON FUNCTION public.lookup_customer             FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_customer             FROM anon;
REVOKE EXECUTE ON FUNCTION public.book_if_available           FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_priority_access       FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_booking_on_block FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_block_booked_count     FROM anon;

GRANT SELECT ON public.classes  TO anon;
GRANT SELECT ON public.blocks   TO anon;
GRANT SELECT ON public.settings TO anon;
GRANT INSERT ON public.parq     TO anon;

GRANT EXECUTE ON FUNCTION public.lookup_customer             TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_customer             TO anon;
GRANT EXECUTE ON FUNCTION public.book_if_available           TO anon;
GRANT EXECUTE ON FUNCTION public.check_priority_access       TO anon;
GRANT EXECUTE ON FUNCTION public.has_active_booking_on_block TO anon;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
