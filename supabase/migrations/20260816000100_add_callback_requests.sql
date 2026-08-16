CREATE TABLE IF NOT EXISTS public.callback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  course text NOT NULL,
  preferred_date date NOT NULL,
  preferred_time time NOT NULL,
  preferred_timezone text NOT NULL DEFAULT 'Asia/Singapore',
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'completed', 'cancelled')),
  assigned_counsellor uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  source_url text,
  referrer text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS callback_requests_lead_created_idx
  ON public.callback_requests (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS callback_requests_status_preferred_idx
  ON public.callback_requests (status, preferred_date, preferred_time);

CREATE INDEX IF NOT EXISTS callback_requests_assigned_counsellor_idx
  ON public.callback_requests (assigned_counsellor)
  WHERE assigned_counsellor IS NOT NULL;

ALTER TABLE public.callback_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS callback_requests_select_authenticated ON public.callback_requests;
CREATE POLICY callback_requests_select_authenticated
  ON public.callback_requests FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS callback_requests_update_authenticated ON public.callback_requests;
CREATE POLICY callback_requests_update_authenticated
  ON public.callback_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_callback_request_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS callback_requests_set_updated_at ON public.callback_requests;
CREATE TRIGGER callback_requests_set_updated_at
  BEFORE UPDATE ON public.callback_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_callback_request_updated_at();

CREATE OR REPLACE FUNCTION public.canonicalize_callback_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF v_digits = '' THEN
    RETURN '';
  END IF;

  IF left(v_digits, 2) = '00' THEN
    v_digits := substr(v_digits, 3);
  END IF;

  IF left(v_digits, 2) = '65' AND length(v_digits) >= 10 THEN
    RETURN '+' || v_digits;
  ELSIF left(v_digits, 1) = '0' AND length(v_digits) = 9 THEN
    RETURN '+65' || substr(v_digits, 2);
  ELSIF length(v_digits) = 8 THEN
    RETURN '+65' || v_digits;
  ELSIF length(v_digits) BETWEEN 7 AND 15 THEN
    RETURN '+' || v_digits;
  END IF;

  RETURN '';
END;
$$;

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
  p_utm jsonb DEFAULT '{}'::jsonb
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
BEGIN
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
      'Created from a website callback request.'
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
    utm
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
    coalesce(p_utm, '{}'::jsonb)
  )
  RETURNING id INTO callback_request_id;

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
    'Callback request received',
    format(
      'Requested a call on %s at %s for %s.',
      p_preferred_date,
      to_char(p_preferred_time, 'HH24:MI'),
      trim(p_course)
    ),
    jsonb_build_object(
      'callback_request_id', callback_request_id,
      'lead_created', v_lead_created
    )
  );

  lead_id := v_lead_id;
  lead_created := v_lead_created;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_callback_request(
  text, text, text, text, date, time, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_callback_request(
  text, text, text, text, date, time, text, text, text, jsonb
) TO service_role;
