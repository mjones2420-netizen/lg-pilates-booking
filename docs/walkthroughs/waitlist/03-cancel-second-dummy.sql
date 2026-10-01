-- Waiting-list walkthrough — 03 (script step 28). Run on PRODUCTION.
-- Cancels Demo Two's booking on the DEMO waiting-list class (stands in for a real cancellation).
-- No emails, no money.
UPDATE bookings SET status = 'cancelled'
WHERE class_id = (SELECT id FROM classes WHERE name = 'DEMO – Waiting list test (please ignore)')
  AND customer_id = (SELECT id FROM customers WHERE email = 'demo-two@lg-pilates-demo.invalid');

-- Raw SQL bypasses the booked-count trigger: resync.
UPDATE blocks b SET booked = (
  SELECT COUNT(*) FROM bookings k WHERE k.block_id = b.id AND k.status != 'cancelled'
) WHERE b.class_id = (SELECT id FROM classes WHERE name = 'DEMO – Waiting list test (please ignore)');

-- Expect: booked 2, cap 3, wait 1
SELECT b.id, b.booked, b.cap, b.wait FROM blocks b
JOIN classes c ON c.id = b.class_id WHERE c.name = 'DEMO – Waiting list test (please ignore)';
