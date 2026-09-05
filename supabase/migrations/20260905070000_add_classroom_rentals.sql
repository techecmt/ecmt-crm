CREATE TABLE IF NOT EXISTS public.classroom_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom text NOT NULL
    CHECK (classroom IN ('classroom_1', 'classroom_2', 'classroom_3')),
  booking_date date NOT NULL,
  start_time time NOT NULL DEFAULT '09:00'::time,
  end_time time NOT NULL DEFAULT '18:00'::time,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  company text,
  purpose text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'confirmed', 'completed', 'cancelled')),
  notes text,
  internal_notes text,
  source_url text,
  referrer text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classroom_rentals_weekday_check
    CHECK (extract(isodow FROM booking_date) BETWEEN 1 AND 5),
  CONSTRAINT classroom_rentals_start_time_check
    CHECK (start_time = '09:00'::time),
  CONSTRAINT classroom_rentals_end_time_check
    CHECK (end_time IN ('18:00'::time, '19:00'::time, '20:00'::time)),
  CONSTRAINT classroom_rentals_time_window_check
    CHECK (end_time > start_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS classroom_rentals_unique_active_slot_idx
  ON public.classroom_rentals (classroom, booking_date)
  WHERE status IN ('new', 'confirmed', 'completed');

CREATE INDEX IF NOT EXISTS classroom_rentals_date_status_idx
  ON public.classroom_rentals (booking_date, status);

CREATE INDEX IF NOT EXISTS classroom_rentals_classroom_date_idx
  ON public.classroom_rentals (classroom, booking_date);

ALTER TABLE public.classroom_rentals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS classroom_rentals_select_authenticated ON public.classroom_rentals;
CREATE POLICY classroom_rentals_select_authenticated
  ON public.classroom_rentals FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS classroom_rentals_insert_authenticated ON public.classroom_rentals;
CREATE POLICY classroom_rentals_insert_authenticated
  ON public.classroom_rentals FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS classroom_rentals_update_authenticated ON public.classroom_rentals;
CREATE POLICY classroom_rentals_update_authenticated
  ON public.classroom_rentals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_classroom_rental_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classroom_rentals_set_updated_at ON public.classroom_rentals;
CREATE TRIGGER classroom_rentals_set_updated_at
  BEFORE UPDATE ON public.classroom_rentals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_classroom_rental_updated_at();

DROP FUNCTION IF EXISTS public.submit_classroom_rental(
  text, date, time, text, text, text, text, text, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.submit_classroom_rental(
  p_classroom text,
  p_booking_date date,
  p_end_time time DEFAULT '18:00'::time,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_company text DEFAULT NULL,
  p_purpose text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_utm jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (rental_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_classroom text := lower(trim(coalesce(p_classroom, '')));
  v_end_time time := coalesce(p_end_time, '18:00'::time);
BEGIN
  IF v_classroom NOT IN ('classroom_1', 'classroom_2', 'classroom_3') THEN
    RAISE EXCEPTION 'Invalid classroom selected';
  END IF;

  IF p_booking_date IS NULL THEN
    RAISE EXCEPTION 'Booking date is required';
  END IF;

  IF extract(isodow FROM p_booking_date) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Bookings are available Monday to Friday only';
  END IF;

  IF v_end_time NOT IN ('18:00'::time, '19:00'::time, '20:00'::time) THEN
    RAISE EXCEPTION 'End time must be 18:00, 19:00, or 20:00';
  END IF;

  INSERT INTO public.classroom_rentals (
    classroom,
    booking_date,
    start_time,
    end_time,
    full_name,
    email,
    phone,
    company,
    purpose,
    notes,
    source_url,
    referrer,
    utm
  )
  VALUES (
    v_classroom,
    p_booking_date,
    '09:00'::time,
    v_end_time,
    trim(coalesce(p_full_name, '')),
    lower(trim(coalesce(p_email, ''))),
    trim(coalesce(p_phone, '')),
    nullif(trim(coalesce(p_company, '')), ''),
    nullif(trim(coalesce(p_purpose, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_source_url, '')), ''),
    nullif(trim(coalesce(p_referrer, '')), ''),
    coalesce(p_utm, '{}'::jsonb)
  )
  RETURNING id INTO rental_id;

  RETURN NEXT;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This classroom is already booked for that date'
      USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_classroom_rental(
  text, date, time, text, text, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_classroom_rental(
  text, date, time, text, text, text, text, text, text, text, text, jsonb
) TO service_role;
