-- Migration 03: Indexes
-- Partial unique index on bookings to prevent duplicate active bookings
-- per customer per block. Matches production exactly.

CREATE UNIQUE INDEX bookings_unique_active_per_block
  ON public.bookings (customer_id, block_id)
  WHERE status != 'cancelled';
