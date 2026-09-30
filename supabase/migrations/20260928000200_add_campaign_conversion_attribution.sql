-- Conversion attribution for WhatsApp campaigns.
-- Lean mode: no ROI/cost math, only applied/enrolled attribution counts.

ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS conversion_window_applied_days integer NOT NULL DEFAULT 14
    CHECK (conversion_window_applied_days >= 0),
  ADD COLUMN IF NOT EXISTS conversion_window_enrolled_days integer NOT NULL DEFAULT 30
    CHECK (conversion_window_enrolled_days >= 0);

CREATE TABLE IF NOT EXISTS public.lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_status_history_lead_changed_idx
  ON public.lead_status_history (lead_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS lead_status_history_to_status_changed_idx
  ON public.lead_status_history (to_status, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_campaign_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_event_id uuid NOT NULL UNIQUE REFERENCES public.lead_status_history(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  campaign_recipient_id uuid NOT NULL REFERENCES public.whatsapp_campaign_recipients(id) ON DELETE CASCADE,
  conversion_type text NOT NULL CHECK (conversion_type IN ('applied', 'enrolled')),
  channel text NOT NULL DEFAULT 'whatsapp',
  course_name text,
  intake text,
  sent_at timestamptz NOT NULL,
  converted_at timestamptz NOT NULL,
  window_days integer NOT NULL CHECK (window_days >= 0),
  attribution_model text NOT NULL DEFAULT 'last_touch',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_campaign_attributions_campaign_type_idx
  ON public.lead_campaign_attributions (campaign_id, conversion_type, converted_at DESC);

CREATE INDEX IF NOT EXISTS lead_campaign_attributions_lead_idx
  ON public.lead_campaign_attributions (lead_id, converted_at DESC);

CREATE INDEX IF NOT EXISTS lead_campaign_attributions_recipient_idx
  ON public.lead_campaign_attributions (campaign_recipient_id);

CREATE OR REPLACE FUNCTION public.process_lead_conversion_event(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.lead_status_history%ROWTYPE;
  v_conversion_type text;
  v_match record;
  v_attr_id uuid;
  v_course_name text;
BEGIN
  SELECT *
  INTO v_event
  FROM public.lead_status_history
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_event.to_status = 'registration_unpaid' THEN
    v_conversion_type := 'applied';
  ELSIF v_event.to_status = 'registered_paid_reg_fee' THEN
    v_conversion_type := 'enrolled';
  ELSE
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_attr_id
  FROM public.lead_campaign_attributions
  WHERE conversion_event_id = v_event.id;
  IF FOUND THEN
    RETURN v_attr_id;
  END IF;

  SELECT
    recipient.id AS campaign_recipient_id,
    recipient.campaign_id,
    recipient.sent_at,
    CASE
      WHEN v_conversion_type = 'applied'
        THEN GREATEST(COALESCE(campaign.conversion_window_applied_days, 14), 0)
      ELSE
        GREATEST(COALESCE(campaign.conversion_window_enrolled_days, 30), 0)
    END AS window_days
  INTO v_match
  FROM public.whatsapp_campaign_recipients AS recipient
  INNER JOIN public.whatsapp_campaigns AS campaign
    ON campaign.id = recipient.campaign_id
  WHERE recipient.lead_id = v_event.lead_id
    AND recipient.status = 'sent'
    AND recipient.sent_at IS NOT NULL
    AND recipient.sent_at <= v_event.changed_at
    AND v_event.changed_at <= recipient.sent_at + make_interval(
      days => CASE
        WHEN v_conversion_type = 'applied'
          THEN GREATEST(COALESCE(campaign.conversion_window_applied_days, 14), 0)
        ELSE
          GREATEST(COALESCE(campaign.conversion_window_enrolled_days, 30), 0)
      END
    )
  ORDER BY recipient.sent_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT leads.interested_course
  INTO v_course_name
  FROM public.leads
  WHERE leads.id = v_event.lead_id;

  INSERT INTO public.lead_campaign_attributions (
    conversion_event_id,
    lead_id,
    campaign_id,
    campaign_recipient_id,
    conversion_type,
    channel,
    course_name,
    intake,
    sent_at,
    converted_at,
    window_days,
    attribution_model,
    metadata
  )
  VALUES (
    v_event.id,
    v_event.lead_id,
    v_match.campaign_id,
    v_match.campaign_recipient_id,
    v_conversion_type,
    'whatsapp',
    v_course_name,
    NULL,
    v_match.sent_at,
    v_event.changed_at,
    v_match.window_days,
    'last_touch',
    jsonb_build_object(
      'source_status', v_event.to_status,
      'status_history_id', v_event.id
    )
  )
  ON CONFLICT (conversion_event_id) DO NOTHING
  RETURNING id INTO v_attr_id;

  IF v_attr_id IS NULL THEN
    SELECT id
    INTO v_attr_id
    FROM public.lead_campaign_attributions
    WHERE conversion_event_id = v_event.id;
  END IF;

  RETURN v_attr_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_lead_status_history_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_lead_conversion_event(NEW.id);
  RETURN NEW;
END;
$$;

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

DROP TRIGGER IF EXISTS leads_capture_status_history_trg ON public.leads;
CREATE TRIGGER leads_capture_status_history_trg
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_lead_status_history();

DROP TRIGGER IF EXISTS lead_status_history_attribution_trg ON public.lead_status_history;
CREATE TRIGGER lead_status_history_attribution_trg
  AFTER INSERT ON public.lead_status_history
  FOR EACH ROW
  EXECUTE FUNCTION public.after_lead_status_history_insert();

CREATE OR REPLACE FUNCTION public.process_pending_campaign_attributions(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_processed integer := 0;
BEGIN
  FOR v_event_id IN
    SELECT history.id
    FROM public.lead_status_history AS history
    WHERE history.to_status IN ('registration_unpaid', 'registered_paid_reg_fee')
      AND history.changed_at >= now() - interval '90 days'
      AND NOT EXISTS (
        SELECT 1
        FROM public.lead_campaign_attributions AS attribution
        WHERE attribution.conversion_event_id = history.id
      )
    ORDER BY history.changed_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 500), 0)
  LOOP
    PERFORM public.process_lead_conversion_event(v_event_id);
    v_processed := v_processed + 1;
  END LOOP;
  RETURN v_processed;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'process_pending_campaign_attributions'
    ) THEN
      PERFORM cron.schedule(
        'process_pending_campaign_attributions',
        '*/20 * * * *',
        'SELECT public.process_pending_campaign_attributions(500);'
      );
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Keep migration resilient in environments without pg_cron access.
    NULL;
END
$$;

ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_campaign_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_status_history_select_authenticated ON public.lead_status_history;
CREATE POLICY lead_status_history_select_authenticated
  ON public.lead_status_history FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS lead_campaign_attributions_select_authenticated ON public.lead_campaign_attributions;
CREATE POLICY lead_campaign_attributions_select_authenticated
  ON public.lead_campaign_attributions FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON FUNCTION public.process_lead_conversion_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_pending_campaign_attributions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_pending_campaign_attributions(integer) TO service_role;
