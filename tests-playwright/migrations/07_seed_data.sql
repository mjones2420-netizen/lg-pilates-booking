-- Migration 07: Seed data for Playwright tests
-- Deterministic data relative to CURRENT_DATE so tests are stable across runs.
-- All dates/blocks computed from today, not hard-coded.

DO $$
DECLARE
  v_today           DATE := CURRENT_DATE;
  v_class_mon       INT;
  v_class_wed       INT;
  v_class_fri       INT;
  v_cust_ret_one    INT;
  v_cust_ret_two    INT;
  v_cust_admin      INT;
  v_block_past      INT;
  v_block_current   INT;
  v_block_std       INT;
  v_block_prio      INT;
  v_block_full      INT;
  v_block_locked    INT;
  -- Helper for day-aligning dates
  v_start_past      DATE;
  v_start_current   DATE;
  v_start_std       DATE;
  v_start_prio      DATE;
  v_start_full      DATE;
  v_start_locked    DATE;
BEGIN
  -- Compute day-aligned start dates
  -- Monday class: align to Monday
  v_start_past    := (v_today - INTERVAL '50 days')::DATE;
  v_start_past    := v_start_past    + ((1 - EXTRACT(DOW FROM v_start_past)::INT  + 7) % 7);
  v_start_current := (v_today - INTERVAL '14 days')::DATE;
  v_start_current := v_start_current + ((1 - EXTRACT(DOW FROM v_start_current)::INT + 7) % 7);
  -- Wednesday class: align to Wednesday
  v_start_std     := (v_today + INTERVAL '3 days')::DATE;
  v_start_std     := v_start_std     + ((3 - EXTRACT(DOW FROM v_start_std)::INT    + 7) % 7);
  v_start_prio    := (v_today + INTERVAL '10 days')::DATE;
  v_start_prio    := v_start_prio    + ((3 - EXTRACT(DOW FROM v_start_prio)::INT   + 7) % 7);
  v_start_full    := v_start_std;  -- reuse Wednesday slot
  -- Friday class: align to Friday
  v_start_locked  := (v_today + INTERVAL '20 days')::DATE;
  v_start_locked  := v_start_locked  + ((5 - EXTRACT(DOW FROM v_start_locked)::INT + 7) % 7);

  -- ========================================
  -- CLASSES
  -- ========================================
  INSERT INTO classes (name, day, time, end_time, venue, loc, level)
  VALUES ('Mixed Ability',  'Monday',    '9:45am',  '10:30am', 'Baildon Moravian Church', 'Baildon',  'Mixed Ability')
  RETURNING id INTO v_class_mon;

  INSERT INTO classes (name, day, time, end_time, venue, loc, level)
  VALUES ('Beginner',       'Wednesday', '7:00pm',  '7:45pm',  'Potting Shed',             'Guiseley', 'Beginner')
  RETURNING id INTO v_class_wed;

  INSERT INTO classes (name, day, time, end_time, venue, loc, level)
  VALUES ('Intermediate',   'Friday',    '10:30am', '11:15am', 'St Johns Parish Church',   'Baildon',  'Intermediate')
  RETURNING id INTO v_class_fri;

  -- ========================================
  -- CUSTOMERS
  -- ========================================
  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Returning', 'One', 'returning-one@test.example', '07700900001', 'returning')
  RETURNING id INTO v_cust_ret_one;

  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Returning', 'Two', 'returning-two@test.example', '07700900002', 'returning')
  RETURNING id INTO v_cust_ret_two;

  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Admin', 'Dummy', 'admin-dummy@test.example', '07700900099', 'returning')
  RETURNING id INTO v_cust_admin;

  -- ========================================
  -- BLOCKS
  -- Dates array format must match app's "D MMM" format (e.g. "6 Apr")
  -- ========================================

  -- Class Mon: past block
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, status, visible)
  VALUES (
    v_class_mon,
    v_start_past,
    v_start_past + INTERVAL '35 days',
    6,
    ARRAY[
      TO_CHAR(v_start_past,                      'FMDD FMMon'),
      TO_CHAR(v_start_past + INTERVAL '7 days',  'FMDD FMMon'),
      TO_CHAR(v_start_past + INTERVAL '14 days', 'FMDD FMMon'),
      TO_CHAR(v_start_past + INTERVAL '21 days', 'FMDD FMMon'),
      TO_CHAR(v_start_past + INTERVAL '28 days', 'FMDD FMMon'),
      TO_CHAR(v_start_past + INTERVAL '35 days', 'FMDD FMMon')
    ],
    10, 12, 'completed', true
  ) RETURNING id INTO v_block_past;

  -- Class Mon: current block (running right now)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, status, visible)
  VALUES (
    v_class_mon,
    v_start_current,
    v_start_current + INTERVAL '35 days',
    6,
    ARRAY[
      TO_CHAR(v_start_current,                      'FMDD FMMon'),
      TO_CHAR(v_start_current + INTERVAL '7 days',  'FMDD FMMon'),
      TO_CHAR(v_start_current + INTERVAL '14 days', 'FMDD FMMon'),
      TO_CHAR(v_start_current + INTERVAL '21 days', 'FMDD FMMon'),
      TO_CHAR(v_start_current + INTERVAL '28 days', 'FMDD FMMon'),
      TO_CHAR(v_start_current + INTERVAL '35 days', 'FMDD FMMon')
    ],
    10, 12, 'active', true
  ) RETURNING id INTO v_block_current;

  -- Class Wed: upcoming standard window (3 days away)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, status, visible)
  VALUES (
    v_class_wed,
    v_start_std,
    v_start_std + INTERVAL '35 days',
    6,
    ARRAY[
      TO_CHAR(v_start_std,                      'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '7 days',  'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '14 days', 'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '21 days', 'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '28 days', 'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '35 days', 'FMDD FMMon')
    ],
    10, 12, 'upcoming', true
  ) RETURNING id INTO v_block_std;

  -- Class Wed: upcoming priority window (10 days away)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, status, visible)
  VALUES (
    v_class_wed,
    v_start_prio,
    v_start_prio + INTERVAL '35 days',
    6,
    ARRAY[
      TO_CHAR(v_start_prio,                      'FMDD FMMon'),
      TO_CHAR(v_start_prio + INTERVAL '7 days',  'FMDD FMMon'),
      TO_CHAR(v_start_prio + INTERVAL '14 days', 'FMDD FMMon'),
      TO_CHAR(v_start_prio + INTERVAL '21 days', 'FMDD FMMon'),
      TO_CHAR(v_start_prio + INTERVAL '28 days', 'FMDD FMMon'),
      TO_CHAR(v_start_prio + INTERVAL '35 days', 'FMDD FMMon')
    ],
    10, 12, 'upcoming', true
  ) RETURNING id INTO v_block_prio;

  -- Class Wed: full block (cap 2, will be filled below)
  -- Using +4 days so it doesn't collide with v_block_std (overlap validation)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, status, visible)
  VALUES (
    v_class_wed,
    v_start_std + INTERVAL '28 days',  -- offset from std to avoid overlap
    v_start_std + INTERVAL '63 days',
    6,
    ARRAY[
      TO_CHAR(v_start_std + INTERVAL '28 days', 'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '35 days', 'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '42 days', 'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '49 days', 'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '56 days', 'FMDD FMMon'),
      TO_CHAR(v_start_std + INTERVAL '63 days', 'FMDD FMMon')
    ],
    10, 2, 'upcoming', true
  ) RETURNING id INTO v_block_full;

  -- Class Fri: upcoming locked (20+ days away)
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, status, visible)
  VALUES (
    v_class_fri,
    v_start_locked,
    v_start_locked + INTERVAL '35 days',
    6,
    ARRAY[
      TO_CHAR(v_start_locked,                      'FMDD FMMon'),
      TO_CHAR(v_start_locked + INTERVAL '7 days',  'FMDD FMMon'),
      TO_CHAR(v_start_locked + INTERVAL '14 days', 'FMDD FMMon'),
      TO_CHAR(v_start_locked + INTERVAL '21 days', 'FMDD FMMon'),
      TO_CHAR(v_start_locked + INTERVAL '28 days', 'FMDD FMMon'),
      TO_CHAR(v_start_locked + INTERVAL '35 days', 'FMDD FMMon')
    ],
    10, 12, 'upcoming', true
  ) RETURNING id INTO v_block_locked;

  -- ========================================
  -- BOOKINGS
  -- ========================================

  -- returning-one: confirmed booking on Mon past block → grants priority for Mon current block
  INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
  VALUES (v_class_mon, v_block_past, v_cust_ret_one, 'confirmed', 60);

  -- returning-two: confirmed booking on Mon past block (second priority user)
  INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
  VALUES (v_class_mon, v_block_past, v_cust_ret_two, 'confirmed', 60);

  -- Fill the "full" block to cap 2 using admin-dummy and returning-two
  INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
  VALUES (v_class_wed, v_block_full, v_cust_admin,   'confirmed', 60);
  INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
  VALUES (v_class_wed, v_block_full, v_cust_ret_two, 'confirmed', 60);

  -- ========================================
  -- PER-CLASS MANUAL PRIORITY
  -- ========================================
  -- returning-one has manual priority on class_wed (Beginner)
  -- Lets tests exercise the manual-priority-path independently from previous-block path
  INSERT INTO customer_class_priority (customer_id, class_id)
  VALUES (v_cust_ret_one, v_class_wed);

  -- ========================================
  -- SETTINGS (bank details placeholders)
  -- ========================================
  INSERT INTO settings (key, value) VALUES
    ('bank_name',       'LG Pilates Test'),
    ('bank_sort_code',  '00-00-00'),
    ('bank_account_no', '00000000');

  -- ========================================
  -- Manual resync of blocks.booked
  -- (trg_sync_block_booked_count fires on app-level inserts only, not DO-block inserts
  --  via plpgsql — safer to resync explicitly)
  -- ========================================
  UPDATE blocks b
  SET booked = (
    SELECT COUNT(*) FROM bookings
    WHERE block_id = b.id AND status != 'cancelled'
  );

END $$;
