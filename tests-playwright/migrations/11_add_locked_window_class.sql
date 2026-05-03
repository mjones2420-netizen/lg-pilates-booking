-- Migration 11 — Add a 4th class with an active block + a >14-day upcoming block.
--
-- Purpose: enables PB-01 (locked-window UI test). The existing fixture (Mon,
-- Wed, Fri classes seeded by Migration 09) does not render the locked-window
-- panel anywhere — every class's nextBlk is either in the priority window
-- (8-14d) or the standard window (0-7d), or has no nextBlk at all.
--
-- This migration is purely additive:
--   * Adds class id=4 (Thursday Mixed Ability, Baildon)
--   * Adds two blocks for class 4:
--       - tue-current  : active, started ~14 days ago, ends in ~21 days
--       - tue-locked   : upcoming, starts in 30 days (>14d → locked window)
--   * Adds NO customers, NO bookings, NO priority grants.
--
-- Re-runnable: idempotent. Re-running deletes any existing class id=4 rows
-- (and cascades blocks), then re-inserts.
--
-- After running this migration, the booking page renders the Thursday card
-- with tue-current as the active block and tue-locked as a >14d nextBlk —
-- which produces the disabled "Not Open Yet" panel PB-01 asserts.

BEGIN;

-- Clean slate for this migration's class so it's idempotent.
-- ON DELETE CASCADE on block FKs will remove the blocks too.
DELETE FROM blocks   WHERE class_id = 4;
DELETE FROM classes  WHERE id = 4;

-- Class 4: Thursday Mixed Ability, Baildon. Mirrors the shape of class 1.
INSERT INTO classes (id, name, level, day, time, end_time, venue, loc)
VALUES (
  4,
  'Mixed Ability',
  'Mixed Ability',
  'Thursday',
  '6:30pm',
  '7:15pm',
  'Baildon Moravian Church',
  'Baildon'
);

-- Bring sequence forward so future inserts don't collide with id=4.
SELECT setval(
  pg_get_serial_sequence('classes', 'id'),
  GREATEST((SELECT MAX(id) FROM classes), 4)
);

-- tue-current: active block. Started 14 days ago, ends 21 days from now.
-- Dates array uses display format ("D MMM"), matching how the front-end
-- renders class-card pills (see context.txt re: blocks.dates[]).
INSERT INTO blocks (
  class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status
) VALUES (
  4,
  CURRENT_DATE - INTERVAL '14 days',
  CURRENT_DATE + INTERVAL '21 days',
  6,
  ARRAY[
    to_char(CURRENT_DATE - INTERVAL '14 days', 'FMDD Mon'),
    to_char(CURRENT_DATE - INTERVAL '7 days',  'FMDD Mon'),
    to_char(CURRENT_DATE,                       'FMDD Mon'),
    to_char(CURRENT_DATE + INTERVAL '7 days',  'FMDD Mon'),
    to_char(CURRENT_DATE + INTERVAL '14 days', 'FMDD Mon'),
    to_char(CURRENT_DATE + INTERVAL '21 days', 'FMDD Mon')
  ],
  10,
  12,
  0,
  TRUE,
  'active'
);

-- tue-locked: locked-window block. Starts 30 days from now (>14d → locked).
-- Six weekly sessions running from +30d to +65d.
INSERT INTO blocks (
  class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status
) VALUES (
  4,
  CURRENT_DATE + INTERVAL '30 days',
  CURRENT_DATE + INTERVAL '65 days',
  6,
  ARRAY[
    to_char(CURRENT_DATE + INTERVAL '30 days', 'FMDD Mon'),
    to_char(CURRENT_DATE + INTERVAL '37 days', 'FMDD Mon'),
    to_char(CURRENT_DATE + INTERVAL '44 days', 'FMDD Mon'),
    to_char(CURRENT_DATE + INTERVAL '51 days', 'FMDD Mon'),
    to_char(CURRENT_DATE + INTERVAL '58 days', 'FMDD Mon'),
    to_char(CURRENT_DATE + INTERVAL '65 days', 'FMDD Mon')
  ],
  10,
  12,
  0,
  TRUE,
  'upcoming'
);

COMMIT;
