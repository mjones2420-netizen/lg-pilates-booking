-- Migration 01: Tables
-- Mirror of production schema (no FKs yet, no RLS yet)

-- 1. classes
CREATE TABLE public.classes (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  day      TEXT NOT NULL,
  time     TEXT,
  end_time TEXT,
  venue    TEXT NOT NULL,
  loc      TEXT,
  level    TEXT
);

-- 2. customers
CREATE TABLE public.customers (
  id            SERIAL PRIMARY KEY,
  first_name    TEXT CHECK (first_name IS NULL OR char_length(first_name) <= 100),
  last_name     TEXT CHECK (last_name IS NULL OR char_length(last_name)  <= 100),
  email         TEXT NOT NULL UNIQUE CHECK (email IS NULL OR char_length(email) <= 200),
  phone         TEXT CHECK (phone IS NULL OR char_length(phone) <= 40),
  customer_type TEXT CHECK (
    (customer_type = ANY (ARRAY['new'::text, 'returning'::text, 'vip'::text]))
    OR customer_type IS NULL
  ),
  created_at    TIMESTAMP DEFAULT now(),
  priority      BOOLEAN DEFAULT false
);

-- 3. blocks
CREATE TABLE public.blocks (
  id         SERIAL PRIMARY KEY,
  class_id   INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  weeks      INTEGER DEFAULT 6  CHECK (weeks >= 1),
  dates      TEXT[],
  price      INTEGER DEFAULT 10 CHECK (price >= 0),
  cap        INTEGER DEFAULT 12 CHECK (cap   >= 1),
  booked     INTEGER DEFAULT 0,
  wait       INTEGER DEFAULT 0,
  visible    BOOLEAN DEFAULT true,
  status     TEXT DEFAULT 'upcoming' CHECK (
    status = ANY (ARRAY['upcoming'::text, 'active'::text, 'completed'::text, 'cancelled'::text])
  ),
  created_at TIMESTAMP DEFAULT now()
);

-- 4. bookings
CREATE TABLE public.bookings (
  id            SERIAL PRIMARY KEY,
  class_id      INTEGER NOT NULL,
  customer_id   INTEGER NOT NULL,
  block_id      INTEGER NOT NULL,
  status        TEXT DEFAULT 'reserved' CHECK (
    status = ANY (ARRAY['reserved'::text, 'confirmed'::text, 'cancelled'::text,
                        'refund-pending'::text, 'refunded'::text, 'waitlist'::text])
  ),
  amount_due    INTEGER,
  refund_status TEXT,
  refund_amount NUMERIC,
  created_at    TIMESTAMP DEFAULT now()
);

-- 5. parq
CREATE TABLE public.parq (
  id                      SERIAL PRIMARY KEY,
  booking_id              INTEGER,
  customer_id             INTEGER,
  age                     TEXT,
  q1_heart                TEXT,
  q2_circulatory          TEXT,
  q3_blood_pressure       TEXT,
  q4_chest_pain           TEXT,
  q5_joint                TEXT,
  q6_dizziness            TEXT,
  q7_pregnant             TEXT,
  q8_doctor_advised       TEXT,
  q9_spinal               TEXT,
  q10_medication          TEXT,
  q11_asthma              TEXT,
  q12_other_reasons       TEXT,
  yes_details             TEXT CHECK (yes_details      IS NULL OR char_length(yes_details)           <= 4000),
  additional_notes        TEXT CHECK (additional_notes IS NULL OR char_length(additional_notes)      <= 4000),
  emergency_name          TEXT CHECK (emergency_name   IS NULL OR char_length(emergency_name)        <= 100),
  emergency_relationship  TEXT CHECK (emergency_relationship IS NULL OR char_length(emergency_relationship) <= 50),
  emergency_phone         TEXT CHECK (emergency_phone  IS NULL OR char_length(emergency_phone)       <= 40),
  print_name              TEXT CHECK (print_name       IS NULL OR char_length(print_name)            <= 100),
  sign_date               DATE,
  created_at              TIMESTAMP DEFAULT now()
);

-- 6. settings
CREATE TABLE public.settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 7. waitlist
CREATE TABLE public.waitlist (
  id          SERIAL PRIMARY KEY,
  class_id    INTEGER,
  customer_id INTEGER,
  created_at  TIMESTAMP DEFAULT now()
);

-- 8. cancellations
CREATE TABLE public.cancellations (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id        BIGINT,
  class_id           BIGINT,
  block_id           BIGINT,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT NOT NULL,
  class_name         TEXT,
  venue              TEXT,
  block_start_date   DATE,
  block_end_date     DATE,
  sessions_attended  INTEGER NOT NULL DEFAULT 0,
  sessions_remaining INTEGER NOT NULL DEFAULT 0,
  price_per_session  NUMERIC NOT NULL DEFAULT 0,
  refund_amount      NUMERIC NOT NULL DEFAULT 0,
  refunded           BOOLEAN NOT NULL DEFAULT false,
  refunded_at        TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. customer_class_priority
CREATE TABLE public.customer_class_priority (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  class_id    BIGINT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, class_id)
);
