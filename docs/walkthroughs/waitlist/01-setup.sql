-- Waiting-list walkthrough — 01 SETUP. Run on PRODUCTION (Supabase SQL Editor), once per run.
-- Purely additive; 04-teardown.sql removes it all. Refuses to run if DEMO classes already exist.
DO $$
DECLARE
  -- Most recent Sunday (today if Sunday): block is current with 5-6 sessions left.
  demo_start DATE := CURRENT_DATE - (EXTRACT(DOW FROM CURRENT_DATE)::INT);
  wl_class_id BIGINT; src_class_id BIGINT;
  wl_block_id BIGINT; src_block_id BIGINT;
  c1 BIGINT; c2 BIGINT; c3 BIGINT;
  demo_dates TEXT[];
BEGIN
  IF EXISTS (SELECT 1 FROM classes WHERE name LIKE 'DEMO –%(please ignore)') THEN
    RAISE EXCEPTION 'STOPPED: DEMO classes already exist. Run 04-teardown.sql first. Nothing created.';
  END IF;

  demo_dates := ARRAY(SELECT TO_CHAR(demo_start + (i * INTERVAL '1 week'), 'FMDD Mon') FROM generate_series(0,5) i);

  INSERT INTO classes (name, level, day, time, end_time, venue, loc)
  VALUES ('DEMO – Waiting list test (please ignore)', 'Mixed Ability', 'Sunday', '7:00am', '7:45am', 'Baildon Moravian Church', 'Baildon')
  RETURNING id INTO wl_class_id;
  INSERT INTO classes (name, level, day, time, end_time, venue, loc)
  VALUES ('DEMO – Catch-up source (please ignore)', 'Mixed Ability', 'Sunday', '8:00am', '8:45am', 'Baildon Moravian Church', 'Baildon')
  RETURNING id INTO src_class_id;

  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (wl_class_id, demo_start, (demo_start + INTERVAL '5 weeks')::date, 6, demo_dates, 10, 3, 0, TRUE, 'active')
  RETURNING id INTO wl_block_id;
  INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
  VALUES (src_class_id, demo_start, (demo_start + INTERVAL '5 weeks')::date, 6, demo_dates, 10, 3, 0, TRUE, 'active')
  RETURNING id INTO src_block_id;

  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Demo', 'One', 'demo-one@lg-pilates-demo.invalid', '07700900001', 'returning') RETURNING id INTO c1;
  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Demo', 'Two', 'demo-two@lg-pilates-demo.invalid', '07700900002', 'returning') RETURNING id INTO c2;
  INSERT INTO customers (first_name, last_name, email, phone, customer_type)
  VALUES ('Demo', 'Three', 'demo-three@lg-pilates-demo.invalid', '07700900003', 'returning') RETURNING id INTO c3;

  INSERT INTO bookings (customer_id, class_id, block_id, status, amount_due)
  VALUES (c1, wl_class_id, wl_block_id, 'confirmed', 60),
         (c2, wl_class_id, wl_block_id, 'confirmed', 60),
         (c3, src_class_id, src_block_id, 'confirmed', 60);

  -- Raw SQL bypasses trg_sync_block_booked_count — resync both blocks.
  UPDATE blocks b SET booked = (
    SELECT COUNT(*) FROM bookings k WHERE k.block_id = b.id AND k.status != 'cancelled'
  ) WHERE b.id IN (wl_block_id, src_block_id);
END $$;

-- Verify
SELECT c.id AS class_id, c.name, b.id AS block_id, b.start_date, b.status, b.booked, b.cap, b.wait
FROM classes c JOIN blocks b ON b.class_id = c.id
WHERE c.name LIKE 'DEMO –%' ORDER BY c.id;
