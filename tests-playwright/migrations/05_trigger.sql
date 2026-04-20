-- Migration 05: Trigger
-- trg_sync_block_booked_count fires on bookings INSERT/DELETE to maintain blocks.booked.

DROP TRIGGER IF EXISTS trg_sync_block_booked_count ON public.bookings;

CREATE TRIGGER trg_sync_block_booked_count
  AFTER INSERT OR DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION sync_block_booked_count();
