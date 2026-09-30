-- Treat withdrawn/dropped as terminal (clear pending follow-ups via DB trigger).

CREATE OR REPLACE FUNCTION public.lead_requires_follow_up(p_status lead_status)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT p_status NOT IN (
    'invalid',
    'unable_to_reach',
    'no_response',
    'not_interested',
    'registered_closed',
    'registered_paid_reg_fee',
    'registered_dropped_out',
    'registration_unpaid',
    'course_not_started',
    'withdrawn',
    'dropped'
  );
$$;

CREATE OR REPLACE FUNCTION public.lead_is_terminal_status(p_status lead_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO public
AS $$
  SELECT p_status IN (
    'no_response'::public.lead_status,
    'not_interested'::public.lead_status,
    'invalid'::public.lead_status,
    'unable_to_reach'::public.lead_status,
    'course_not_started'::public.lead_status,
    'registration_unpaid'::public.lead_status,
    'registered_paid_reg_fee'::public.lead_status,
    'registered_closed'::public.lead_status,
    'registered_dropped_out'::public.lead_status,
    'withdrawn'::public.lead_status,
    'dropped'::public.lead_status
  );
$$;
