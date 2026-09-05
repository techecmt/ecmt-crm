ALTER TABLE public.classroom_rentals
  ADD COLUMN IF NOT EXISTS booking_group_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS classroom_rentals_booking_group_idx
  ON public.classroom_rentals (booking_group_id, booking_date);

DROP FUNCTION IF EXISTS public.submit_classroom_rentals(
  text, date[], time, text, text, text, text, text, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.submit_classroom_rentals(
  p_classroom text,
  p_booking_dates date[],
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
RETURNS TABLE (booking_group_id uuid, rental_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_classroom text := lower(trim(coalesce(p_classroom, '')));
  v_end_time time := coalesce(p_end_time, '18:00'::time);
  v_dates date[];
  v_date date;
  v_rental_id uuid;
  v_booking_group_id uuid := gen_random_uuid();
  v_rental_ids uuid[] := '{}'::uuid[];
BEGIN
  IF v_classroom NOT IN ('classroom_1', 'classroom_2', 'classroom_3') THEN
    RAISE EXCEPTION 'Invalid classroom selected';
  END IF;

  IF v_end_time NOT IN ('18:00'::time, '19:00'::time, '20:00'::time) THEN
    RAISE EXCEPTION 'End time must be 18:00, 19:00, or 20:00';
  END IF;

  SELECT coalesce(array_agg(d ORDER BY d), '{}'::date[])
  INTO v_dates
  FROM (
    SELECT DISTINCT unnest(coalesce(p_booking_dates, '{}'::date[])) AS d
  ) deduped
  WHERE d IS NOT NULL;

  IF coalesce(array_length(v_dates, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one booking date is required';
  END IF;

  FOREACH v_date IN ARRAY v_dates LOOP
    IF extract(isodow FROM v_date) NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'Bookings are available Monday to Friday only';
    END IF;
  END LOOP;

  FOREACH v_date IN ARRAY v_dates LOOP
    INSERT INTO public.classroom_rentals (
      booking_group_id,
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
      v_booking_group_id,
      v_classroom,
      v_date,
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
    RETURNING id INTO v_rental_id;

    v_rental_ids := array_append(v_rental_ids, v_rental_id);
  END LOOP;

  booking_group_id := v_booking_group_id;
  rental_ids := v_rental_ids;
  RETURN NEXT;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'One or more selected dates are already booked for this classroom'
      USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_classroom_rentals(
  text, date[], time, text, text, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_classroom_rentals(
  text, date[], time, text, text, text, text, text, text, text, text, jsonb
) TO service_role;

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
  v_group_id uuid;
  v_rental_ids uuid[];
BEGIN
  SELECT result.booking_group_id, result.rental_ids
  INTO v_group_id, v_rental_ids
  FROM public.submit_classroom_rentals(
    p_classroom,
    ARRAY[p_booking_date],
    p_end_time,
    p_full_name,
    p_email,
    p_phone,
    p_company,
    p_purpose,
    p_notes,
    p_source_url,
    p_referrer,
    p_utm
  ) AS result;

  IF coalesce(array_length(v_rental_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Unable to create booking';
  END IF;

  rental_id := v_rental_ids[1];
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_classroom_rental(
  text, date, time, text, text, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_classroom_rental(
  text, date, time, text, text, text, text, text, text, text, text, jsonb
) TO service_role;
