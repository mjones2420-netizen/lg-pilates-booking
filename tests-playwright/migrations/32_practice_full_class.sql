-- Migration 32 — Practice full class for the Training Hub (#114).
--
-- Purpose: gives the practice copy (TEST only) a class whose CURRENT block is
-- full, so the booking page shows "Join Waiting List" and Louise can rehearse
-- the waiting-list lesson (hub lesson 2.5) for real. The existing mon-full
-- block is the Monday class's 3rd block, so the booking page never shows it.
--
-- Purely additive, run by scripts/seed.js AFTER migration 09 (which wipes all
-- blocks, bookings and customers). The seed wraps every migration in one
-- transaction, so there is no BEGIN/COMMIT here.
--   * Class id=5 "Practice – Full Class", Tuesdays
--   * One active block: started on a Tuesday 7–13 days ago, 6 weeks, cap 2
--   * Two made-up customers, each with a confirmed booking on it → full
--
-- Re-runnable: deletes class id=5 (blocks, bookings, waitlist) and the two
-- practice customers first.

DO $$
DECLARE
  -- Always a Tuesday 7–13 days ago: no fixture class uses Tuesday, and specs
  -- find "the Monday/Wednesday/Thursday/Friday class" by day name, so a
  -- day taken from today's date would collide with them.
  practice_start DATE := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::INT - 2 + 7) % 7) - 7;
  practice_block_id BIGINT;
  cust_one_id BIGINT;
  cust_two_id BIGINT;
BEGIN
  DELETE FROM waitlist WHERE block_id IN (SELECT id FROM blocks WHERE class_id = 5);
  DELETE FROM bookings WHERE class_id = 5;
  DELETE FROM blocks   WHERE class_id = 5;
  DELETE FROM classes  WHERE id = 5;
  -- 09 already wipes customers during a seed; this keeps a standalone re-run safe.
  DELETE FROM customers WHERE email IN ('practice-full-one@test.example', 'practice-full-two@test.example');

  INSERT INTO classes (id, name, level, day, time, end_time, venue, loc)
  VALUES (
    5,
    'Practice – Full Class',
    'Mixed Ability',
    'Tuesday',
    '7:30pm',
    '8:15pm',
    'Baildon Moravian Church',
    'Baildon'
  );

  PERFORM setval(
    pg_get_serial_sequence('classes', 'id'),
    GREATEST((SELECT MAX(id) FROM classes), 5)
  );

  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    5, practice_start, (practice_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(practice_start,                      'FMDD Mon'),
      TO_CHAR(practice_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(practice_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(practice_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(practice_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(practice_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 2, 0, TRUE, 'active'
  ) RETURNING id INTO practice_block_id;

  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Practice', 'Full-One', 'practice-full-one@test.example', '07700000011', 'returning')
  RETURNING id INTO cust_one_id;

  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Practice', 'Full-Two', 'practice-full-two@test.example', '07700000012', 'returning')
  RETURNING id INTO cust_two_id;

  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (cust_one_id, 5, practice_block_id, 'confirmed', 60),
         (cust_two_id, 5, practice_block_id, 'confirmed', 60);

  -- Raw SQL bypasses trg_sync_block_booked_count — resync this block.
  UPDATE blocks SET booked = (
    SELECT COUNT(*) FROM bookings WHERE block_id = practice_block_id AND status != 'cancelled'
  ) WHERE id = practice_block_id;
END $$;
