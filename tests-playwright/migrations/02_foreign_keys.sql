-- Migration 02: Foreign Keys
-- All FKs with correct ON DELETE behaviour to match production

ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_class_id_fkey
  FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_class_id_fkey
  FOREIGN KEY (class_id) REFERENCES public.classes(id);

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id);

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_block_id_fkey
  FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;

ALTER TABLE public.parq
  ADD CONSTRAINT parq_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;

ALTER TABLE public.parq
  ADD CONSTRAINT parq_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id);

ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_class_id_fkey
  FOREIGN KEY (class_id) REFERENCES public.classes(id);

ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id);

ALTER TABLE public.customer_class_priority
  ADD CONSTRAINT customer_class_priority_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.customer_class_priority
  ADD CONSTRAINT customer_class_priority_class_id_fkey
  FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
