-- Fix status history trigger: COALESCE(enum, '') coerces '' to lead_status and fails every update.

CREATE OR REPLACE FUNCTION public.capture_lead_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_status_history (
      lead_id,
      from_status,
      to_status,
      changed_at,
      changed_by,
      source,
      metadata
    )
    VALUES (
      NEW.id,
      COALESCE(OLD.status::text, 'unknown'),
      COALESCE(NEW.status::text, 'unknown'),
      now(),
      auth.uid(),
      v_source,
      '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;
