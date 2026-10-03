-- Waiting-list walkthrough — 04 TEARDOWN. Run on PRODUCTION. Removes ONLY demo data:
--   classes named 'DEMO – ... (please ignore)', their blocks/bookings/waitlist/swaps/join requests,
--   dummy customers @lg-pilates-demo.invalid, and walkthrough customers mjones970+demoa/b/c.
-- All-or-nothing: if the safety check fails, nothing is deleted.
DO $$
DECLARE
  demo_classes BIGINT[];
  demo_blocks  BIGINT[];
  demo_custs   BIGINT[];
  demo_emails  TEXT[] := ARRAY['mjones970+demoa@live.co.uk','mjones970+demob@live.co.uk','mjones970+democ@live.co.uk'];
  outside INT;
BEGIN
  demo_classes := ARRAY(SELECT id FROM classes WHERE name LIKE 'DEMO –%(please ignore)');
  demo_blocks  := ARRAY(SELECT id FROM blocks WHERE class_id = ANY(demo_classes));
  demo_custs   := ARRAY(SELECT id FROM customers
                        WHERE email LIKE '%@lg-pilates-demo.invalid' OR lower(email) = ANY(demo_emails));

  -- Safety: stop if any demo customer has a booking on a real (non-demo) class.
  SELECT COUNT(*) INTO outside FROM bookings
  WHERE customer_id = ANY(demo_custs) AND NOT (class_id = ANY(demo_classes));
  IF outside > 0 THEN
    RAISE EXCEPTION 'STOPPED: % demo customer booking(s) on a non-demo class. Nothing deleted.', outside;
  END IF;

  DELETE FROM catch_up_swaps WHERE customer_id = ANY(demo_custs)
     OR source_block_id = ANY(demo_blocks) OR target_block_id = ANY(demo_blocks);
  -- Email-confirmation requests (#110): demo emails anywhere, plus anything on a demo block.
  DELETE FROM waitlist_requests WHERE block_id = ANY(demo_blocks) OR lower(email) = ANY(demo_emails);
  DELETE FROM waitlist WHERE customer_id = ANY(demo_custs) OR block_id = ANY(demo_blocks);
  DELETE FROM parq WHERE customer_id = ANY(demo_custs);
  DELETE FROM bookings WHERE customer_id = ANY(demo_custs) OR class_id = ANY(demo_classes);
  DELETE FROM pending_bookings WHERE class_id = ANY(demo_classes) OR lower(email) = ANY(demo_emails);
  DELETE FROM cancellations WHERE class_id = ANY(demo_classes) OR customer_id = ANY(demo_custs);
  DELETE FROM customer_class_priority WHERE class_id = ANY(demo_classes) OR customer_id = ANY(demo_custs);
  DELETE FROM blocks WHERE id = ANY(demo_blocks);
  DELETE FROM classes WHERE id = ANY(demo_classes);
  DELETE FROM customers WHERE id = ANY(demo_custs);
END $$;

-- Verify: every count should be 0.
SELECT
  (SELECT COUNT(*) FROM classes   WHERE name LIKE 'DEMO –%')                                   AS demo_classes,
  (SELECT COUNT(*) FROM customers WHERE email LIKE '%@lg-pilates-demo.invalid'
                                     OR lower(email) LIKE 'mjones970+demo_@live.co.uk')           AS demo_customers,
  (SELECT COUNT(*) FROM blocks b LEFT JOIN classes c ON c.id = b.class_id WHERE c.id IS NULL)  AS orphan_blocks,
  (SELECT COUNT(*) FROM catch_up_swaps s LEFT JOIN blocks b ON b.id = s.target_block_id WHERE b.id IS NULL) AS orphan_swaps,
  (SELECT COUNT(*) FROM waitlist w LEFT JOIN customers c ON c.id = w.customer_id WHERE c.id IS NULL)       AS orphan_waitlist,
  (SELECT COUNT(*) FROM waitlist_requests WHERE lower(email) LIKE 'mjones970+demo%')                       AS demo_requests;
