-- Seed extension: returning-one has an active booking on the current Monday block
-- Supports CB-31 (duplicate booking caught at step 1 — already-booked screen)
INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
VALUES (1, 1, 2, 'confirmed', 60.00);

-- Manual resync — trigger doesn't fire on migration-context inserts
UPDATE blocks
SET booked = (SELECT COUNT(*) FROM bookings WHERE block_id = blocks.id AND status != 'cancelled')
WHERE id = 2;
