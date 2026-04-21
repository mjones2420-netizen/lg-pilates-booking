-- ============================================================
-- Migration 09: Dynamic date reseed of test fixture
-- Target: lg-pilates-test project (ngzfhamjuviwfwuncrjo)
-- Re-runnable: safe to execute any day
-- Classes preserved; blocks + downstream data rebuilt
-- ============================================================

DO $$
DECLARE
  today DATE := CURRENT_DATE;

  mon_current_start  DATE;
  mon_past_start     DATE;
  mon_upcoming_start DATE;
  mon_full_start     DATE;

  wed_upcoming_start DATE;
  wed_past_start     DATE;

  fri_upcoming_start DATE;
  fri_recent_start   DATE;
  fri_past_start     DATE;

  block_mon_past_id     BIGINT;
  block_mon_current_id  BIGINT;
  block_mon_upcoming_id BIGINT;
  block_mon_full_id     BIGINT;
  block_wed_past_id     BIGINT;
  block_wed_upcoming_id BIGINT;
  block_fri_past_id     BIGINT;
  block_fri_recent_id   BIGINT;
  block_fri_upcoming_id BIGINT;

  customer_returning_one_id BIGINT;
  customer_returning_two_id BIGINT;
  customer_admin_dummy_id   BIGINT;
BEGIN
  -- STEP 1: Wipe existing test fixture (FK-safe order)
  DELETE FROM parq;
  DELETE FROM cancellations;
  DELETE FROM bookings;
  DELETE FROM customer_class_priority;
  DELETE FROM customers;
  DELETE FROM blocks;

  -- STEP 2: Compute anchor dates relative to today
  mon_current_start  := (today - ((EXTRACT(DOW FROM today)::INT - 1 + 7) % 7) * INTERVAL '1 day' - INTERVAL '4 weeks')::date;
  mon_past_start     := (mon_current_start - INTERVAL '7 weeks')::date;
  mon_upcoming_start := (mon_current_start + INTERVAL '6 weeks')::date;
  mon_full_start     := (mon_upcoming_start + INTERVAL '6 weeks')::date;

  wed_upcoming_start := ((today + INTERVAL '8 days')::date
                        + ((3 - EXTRACT(DOW FROM (today + INTERVAL '8 days'))::INT + 7) % 7) * INTERVAL '1 day')::date;
  wed_past_start     := (wed_upcoming_start - INTERVAL '10 weeks')::date;

  fri_upcoming_start := (today + ((5 - EXTRACT(DOW FROM today)::INT + 7) % 7) * INTERVAL '1 day')::date;
  fri_recent_start   := (fri_upcoming_start - INTERVAL '6 weeks')::date;
  fri_past_start     := (fri_recent_start - INTERVAL '7 weeks')::date;

  -- STEP 3: Insert blocks
  -- Monday past (completed)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    1, mon_past_start, (mon_past_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(mon_past_start,                       'FMDD Mon'),
      TO_CHAR(mon_past_start + INTERVAL '1 week',   'FMDD Mon'),
      TO_CHAR(mon_past_start + INTERVAL '2 weeks',  'FMDD Mon'),
      TO_CHAR(mon_past_start + INTERVAL '3 weeks',  'FMDD Mon'),
      TO_CHAR(mon_past_start + INTERVAL '4 weeks',  'FMDD Mon'),
      TO_CHAR(mon_past_start + INTERVAL '5 weeks',  'FMDD Mon')
    ],
    10, 12, 0, TRUE, 'completed'
  ) RETURNING id INTO block_mon_past_id;

  -- Monday current (active)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    1, mon_current_start, (mon_current_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(mon_current_start,                      'FMDD Mon'),
      TO_CHAR(mon_current_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(mon_current_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(mon_current_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(mon_current_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(mon_current_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 12, 0, TRUE, 'active'
  ) RETURNING id INTO block_mon_current_id;

  -- Monday upcoming (locked window)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    1, mon_upcoming_start, (mon_upcoming_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(mon_upcoming_start,                      'FMDD Mon'),
      TO_CHAR(mon_upcoming_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(mon_upcoming_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(mon_upcoming_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(mon_upcoming_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(mon_upcoming_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 12, 0, TRUE, 'upcoming'
  ) RETURNING id INTO block_mon_upcoming_id;

  -- Monday full (cap 2, fills completely)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    1, mon_full_start, (mon_full_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(mon_full_start,                      'FMDD Mon'),
      TO_CHAR(mon_full_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(mon_full_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(mon_full_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(mon_full_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(mon_full_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 2, 0, TRUE, 'upcoming'
  ) RETURNING id INTO block_mon_full_id;

  -- Wednesday past (completed)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    2, wed_past_start, (wed_past_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(wed_past_start,                      'FMDD Mon'),
      TO_CHAR(wed_past_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(wed_past_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(wed_past_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(wed_past_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(wed_past_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 12, 0, TRUE, 'completed'
  ) RETURNING id INTO block_wed_past_id;

  -- Wednesday upcoming (priority window)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    2, wed_upcoming_start, (wed_upcoming_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(wed_upcoming_start,                      'FMDD Mon'),
      TO_CHAR(wed_upcoming_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(wed_upcoming_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(wed_upcoming_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(wed_upcoming_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(wed_upcoming_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 12, 0, TRUE, 'upcoming'
  ) RETURNING id INTO block_wed_upcoming_id;

  -- Friday past (older completed)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    3, fri_past_start, (fri_past_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(fri_past_start,                      'FMDD Mon'),
      TO_CHAR(fri_past_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(fri_past_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(fri_past_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(fri_past_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(fri_past_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 12, 0, TRUE, 'completed'
  ) RETURNING id INTO block_fri_past_id;

  -- Friday recent (just-finished)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    3, fri_recent_start, (fri_recent_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(fri_recent_start,                      'FMDD Mon'),
      TO_CHAR(fri_recent_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(fri_recent_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(fri_recent_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(fri_recent_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(fri_recent_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 12, 0, TRUE, 'completed'
  ) RETURNING id INTO block_fri_recent_id;

  -- Friday upcoming (standard window)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (
    3, fri_upcoming_start, (fri_upcoming_start + INTERVAL '5 weeks')::date, 6,
    ARRAY[
      TO_CHAR(fri_upcoming_start,                      'FMDD Mon'),
      TO_CHAR(fri_upcoming_start + INTERVAL '1 week',  'FMDD Mon'),
      TO_CHAR(fri_upcoming_start + INTERVAL '2 weeks', 'FMDD Mon'),
      TO_CHAR(fri_upcoming_start + INTERVAL '3 weeks', 'FMDD Mon'),
      TO_CHAR(fri_upcoming_start + INTERVAL '4 weeks', 'FMDD Mon'),
      TO_CHAR(fri_upcoming_start + INTERVAL '5 weeks', 'FMDD Mon')
    ],
    10, 12, 0, TRUE, 'upcoming'
  ) RETURNING id INTO block_fri_upcoming_id;

  -- STEP 4: Insert customers
  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Returning', 'One', 'returning-one@test.example', '07700000001', 'returning')
  RETURNING id INTO customer_returning_one_id;

  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Returning', 'Two', 'returning-two@test.example', '07700000002', 'returning')
  RETURNING id INTO customer_returning_two_id;

  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Admin', 'Dummy', 'admin-dummy@test.example', '07700000003', 'returning')
  RETURNING id INTO customer_admin_dummy_id;

  -- STEP 5: Insert bookings
  -- Returning-one: confirmed on Mon past (priority-eligibility source)
  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (customer_returning_one_id, 1, block_mon_past_id, 'confirmed', 60);

  -- Returning-one: confirmed on Mon current (CB-31 duplicate booking)
  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (customer_returning_one_id, 1, block_mon_current_id, 'confirmed', 60);

  -- Returning-two: confirmed on Mon past
  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (customer_returning_two_id, 1, block_mon_past_id, 'confirmed', 60);

  -- Returning-one: confirmed on Wed past (priority-eligibility for Wed upcoming)
  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (customer_returning_one_id, 2, block_wed_past_id, 'confirmed', 60);

  -- Returning-two: confirmed on Fri recent (priority-eligibility for Fri upcoming)
  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (customer_returning_two_id, 3, block_fri_recent_id, 'confirmed', 60);

  -- Fill the Mon full block (cap 2)
  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (customer_returning_two_id, 1, block_mon_full_id, 'confirmed', 60);

  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (customer_admin_dummy_id, 1, block_mon_full_id, 'confirmed', 60);

  -- STEP 6: Manual per-class priority grants
  INSERT INTO customer_class_priority (customer_id, class_id)
  VALUES (customer_returning_one_id, 2);

  -- STEP 7: Resync blocks.booked (raw SQL bypasses trg_sync_block_booked_count)
  UPDATE blocks b
  SET booked = (
    SELECT COUNT(*) FROM bookings
    WHERE block_id = b.id AND status != 'cancelled'
  );

  RAISE NOTICE 'Migration 09 complete. Anchored to today = %', today;
END $$;
