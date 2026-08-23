-- Callbacks and campus/video appointments share one request table so staff
-- can assign, confirm, and complete both from the same CRM inbox.

ALTER TABLE public.callback_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'callback',
  ADD COLUMN IF NOT EXISTS appointment_mode text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

UPDATE public.callback_requests
SET request_type = 'callback'
WHERE request_type IS NULL;

ALTER TABLE public.callback_requests
  DROP CONSTRAINT IF EXISTS callback_requests_request_type_check;
ALTER TABLE public.callback_requests
  ADD CONSTRAINT callback_requests_request_type_check
  CHECK (request_type IN ('callback', 'appointment'));

ALTER TABLE public.callback_requests
  DROP CONSTRAINT IF EXISTS callback_requests_appointment_mode_check;
ALTER TABLE public.callback_requests
  ADD CONSTRAINT callback_requests_appointment_mode_check
  CHECK (
    appointment_mode IS NULL
    OR appointment_mode IN ('phone', 'video', 'campus')
  );

ALTER TABLE public.callback_requests
  DROP CONSTRAINT IF EXISTS callback_requests_duration_minutes_check;
ALTER TABLE public.callback_requests
  ADD CONSTRAINT callback_requests_duration_minutes_check
  CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 180);

ALTER TABLE public.callback_requests
  DROP CONSTRAINT IF EXISTS callback_requests_status_check;
ALTER TABLE public.callback_requests
  ADD CONSTRAINT callback_requests_status_check
  CHECK (status IN ('new', 'contacted', 'confirmed', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS callback_requests_type_status_preferred_idx
  ON public.callback_requests (request_type, status, preferred_date, preferred_time);

DROP FUNCTION IF EXISTS public.submit_callback_request(
  text, text, text, text, date, time, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.submit_callback_request(
  p_full_name text,
  p_email text,
  p_phone text,
  p_course text,
  p_preferred_date date,
  p_preferred_time time,
  p_preferred_timezone text DEFAULT 'Asia/Singapore',
  p_source_url text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_utm jsonb DEFAULT '{}'::jsonb,
  p_request_type text DEFAULT 'callback',
  p_appointment_mode text DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS TABLE (callback_request_id uuid, lead_id uuid, lead_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_phone_key text := public.canonicalize_callback_phone(p_phone);
  v_lead_created boolean := false;
  v_request_type text := lower(trim(coalesce(p_request_type, 'callback')));
  v_appointment_mode text := nullif(lower(trim(coalesce(p_appointment_mode, ''))), '');
  v_duration integer := p_duration_minutes;
  v_activity_title text;
BEGIN
  IF v_request_type NOT IN ('callback', 'appointment') THEN
    RAISE EXCEPTION 'Invalid request type';
  END IF;

  IF v_request_type = 'appointment' THEN
    IF v_appointment_mode IS NULL OR v_appointment_mode NOT IN ('phone', 'video', 'campus') THEN
      RAISE EXCEPTION 'Appointment mode is required';
    END IF;
    v_duration := coalesce(v_duration, 30);
  ELSE
    v_appointment_mode := NULL;
    v_duration := NULL;
  END IF;

  SELECT l.id
  INTO v_lead_id
  FROM public.leads l
  WHERE v_phone_key <> '' AND l.phone_key = v_phone_key
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    SELECT l.id
    INTO v_lead_id
    FROM public.leads l
    WHERE lower(l.email) = lower(trim(p_email))
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL THEN
    INSERT INTO public.leads (
      full_name,
      phone,
      phone_key,
      email,
      interested_course,
      source,
      status,
      description
    )
    VALUES (
      trim(p_full_name),
      trim(p_phone),
      nullif(v_phone_key, ''),
      lower(trim(p_email)),
      trim(p_course),
      'website',
      'inquiry_received',
      CASE
        WHEN v_request_type = 'appointment'
          THEN 'Created from a website appointment booking.'
        ELSE 'Created from a website callback request.'
      END
    )
    RETURNING id INTO v_lead_id;

    v_lead_created := true;
  END IF;

  INSERT INTO public.callback_requests (
    lead_id,
    full_name,
    email,
    phone,
    course,
    preferred_date,
    preferred_time,
    preferred_timezone,
    source_url,
    referrer,
    utm,
    request_type,
    appointment_mode,
    duration_minutes
  )
  VALUES (
    v_lead_id,
    trim(p_full_name),
    lower(trim(p_email)),
    trim(p_phone),
    trim(p_course),
    p_preferred_date,
    p_preferred_time,
    coalesce(nullif(trim(p_preferred_timezone), ''), 'Asia/Singapore'),
    nullif(trim(p_source_url), ''),
    nullif(trim(p_referrer), ''),
    coalesce(p_utm, '{}'::jsonb),
    v_request_type,
    v_appointment_mode,
    v_duration
  )
  RETURNING id INTO callback_request_id;

  v_activity_title := CASE
    WHEN v_request_type = 'appointment' THEN 'Appointment requested'
    ELSE 'Callback request received'
  END;

  INSERT INTO public.lead_activities (
    lead_id,
    type,
    title,
    description,
    metadata
  )
  VALUES (
    v_lead_id,
    'system',
    v_activity_title,
    format(
      '%s on %s at %s for %s.',
      CASE
        WHEN v_request_type = 'appointment' THEN 'Booked a counselling appointment'
        ELSE 'Requested a call'
      END,
      p_preferred_date,
      to_char(p_preferred_time, 'HH24:MI'),
      trim(p_course)
    ),
    jsonb_build_object(
      'callback_request_id', callback_request_id,
      'lead_created', v_lead_created,
      'request_type', v_request_type,
      'appointment_mode', v_appointment_mode
    )
  );

  lead_id := v_lead_id;
  lead_created := v_lead_created;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_callback_request(
  text, text, text, text, date, time, text, text, text, jsonb, text, text, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_callback_request(
  text, text, text, text, date, time, text, text, text, jsonb, text, text, integer
) TO service_role;
