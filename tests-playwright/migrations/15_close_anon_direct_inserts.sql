-- Migration 15: Close anon direct-insert backdoors (#34)
-- Remove anon INSERT policies on bookings/customers/parq.
-- Replace parq direct insert with a SECURITY DEFINER RPC.
-- bookings + customers already had no INSERT grant; dropping policies is cleanup.
-- parq had GRANT INSERT on parq TO anon — revoke it, grant EXECUTE on new RPC instead.

-- PART A: New SECURITY DEFINER function for parq inserts
CREATE OR REPLACE FUNCTION public.insert_parq(
  p_booking_id       bigint,
  p_customer_id      bigint,
  p_age              text,
  p_q1_heart         text,
  p_q2_circulatory   text,
  p_q3_blood_pressure text,
  p_q4_chest_pain    text,
  p_q5_joint         text,
  p_q6_dizziness     text,
  p_q7_pregnant      text,
  p_q8_doctor_advised text,
  p_q9_spinal        text,
  p_q10_medication   text,
  p_q11_asthma       text,
  p_q12_other_reasons text,
  p_yes_details      text,
  p_additional_notes text,
  p_emergency_name   text,
  p_emergency_relationship text,
  p_emergency_phone  text,
  p_print_name       text,
  p_sign_date        date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate booking exists and belongs to the stated customer
  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE id = p_booking_id AND customer_id = p_customer_id
  ) THEN
    RAISE EXCEPTION 'INVALID_BOOKING';
  END IF;

  INSERT INTO parq (
    booking_id, customer_id, age,
    q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain,
    q5_joint, q6_dizziness, q7_pregnant, q8_doctor_advised,
    q9_spinal, q10_medication, q11_asthma, q12_other_reasons,
    yes_details, additional_notes,
    emergency_name, emergency_relationship, emergency_phone,
    print_name, sign_date
  ) VALUES (
    p_booking_id, p_customer_id, p_age,
    p_q1_heart, p_q2_circulatory, p_q3_blood_pressure, p_q4_chest_pain,
    p_q5_joint, p_q6_dizziness, p_q7_pregnant, p_q8_doctor_advised,
    p_q9_spinal, p_q10_medication, p_q11_asthma, p_q12_other_reasons,
    p_yes_details, p_additional_notes,
    p_emergency_name, p_emergency_relationship, p_emergency_phone,
    p_print_name, p_sign_date
  );
END;
$$;

-- PART B: Drop the three anon INSERT policies
DROP POLICY IF EXISTS "public_create_booking"  ON public.bookings;
DROP POLICY IF EXISTS "public_create_customer" ON public.customers;
DROP POLICY IF EXISTS "public_insert_parq"     ON public.parq;

-- PART C: Revoke anon direct INSERT on parq; grant execute on new RPC
REVOKE INSERT ON public.parq FROM anon;
GRANT EXECUTE ON FUNCTION public.insert_parq TO anon;
