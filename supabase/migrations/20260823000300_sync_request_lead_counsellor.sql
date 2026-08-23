-- New website requests inherit the matched lead's counsellor so the inbox
-- and lead record stay assigned to the same person.

UPDATE public.callback_requests cr
SET assigned_counsellor = l.assigned_counsellor
FROM public.leads l
WHERE cr.lead_id = l.id
  AND cr.assigned_counsellor IS NULL
  AND l.assigned_counsellor IS NOT NULL
  AND cr.status IN ('new', 'contacted', 'confirmed');


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
  v_assigned_counsellor uuid;
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

  SELECT l.assigned_counsellor
  INTO v_assigned_counsellor
  FROM public.leads l
  WHERE l.id = v_lead_id;

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
    duration_minutes,
    assigned_counsellor
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
    v_duration,
    v_assigned_counsellor
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
      'appointment_mode', v_appointment_mode,
      'assigned_counsellor', v_assigned_counsellor
    )
  );

  lead_id := v_lead_id;
  lead_created := v_lead_created;
  RETURN NEXT;
END;
$$;
