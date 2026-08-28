-- Bulk WhatsApp campaigns over Twilio, plus the opt-out ledger that protects them.
--
-- Design notes:
-- - A campaign snapshots its template and audience so later template edits or
--   lead changes never rewrite what was actually sent.
-- - Recipients are materialised up front (deduplicated, opt-outs removed) so the
--   worker only ever drains a fixed list and progress is resumable.
-- - Sends are claimed with FOR UPDATE SKIP LOCKED so overlapping workers on a
--   serverless host can never send the same row twice.

-- ---------------------------------------------------------------------------
-- Opt-outs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.messaging_opt_outs (
  phone_key text PRIMARY KEY,
  phone text NOT NULL,
  source text NOT NULL DEFAULT 'stop_keyword'
    CHECK (source IN ('stop_keyword', 'manual', 'import')),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS do_not_contact_reason text;

CREATE INDEX IF NOT EXISTS leads_do_not_contact_idx
  ON public.leads (do_not_contact)
  WHERE do_not_contact = true;

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  twilio_connection_id uuid NOT NULL
    REFERENCES public.twilio_connections(id) ON DELETE RESTRICT,

  -- Template snapshot. Twilio Content templates are immutable, so the SID plus
  -- the body we previewed is a faithful record of what recipients received.
  content_sid text NOT NULL,
  template_name text NOT NULL DEFAULT '',
  template_language text NOT NULL DEFAULT 'en',
  template_body text,

  -- { "1": { "source": "lead_field" | "static", "value": "full_name" | "Hello" } }
  variable_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Snapshot of the audience selection used to build the recipient list.
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'sending', 'paused', 'completed', 'cancelled', 'failed')),
  total_recipients integer NOT NULL DEFAULT 0,
  -- Denormalised progress, refreshed after each batch so the list view can show
  -- a real progress bar without aggregating the recipient table per request.
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  send_cap integer,
  skip_recent_days integer,
  cost_per_message numeric(10, 5) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  error text,

  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_campaigns_status_created_idx
  ON public.whatsapp_campaigns (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL
    REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  phone text NOT NULL,
  phone_key text NOT NULL,
  full_name text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason text,
  error text,
  external_message_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One send per number per campaign: the dedupe safeguard, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_campaign_recipients_unique_phone_idx
  ON public.whatsapp_campaign_recipients (campaign_id, phone_key);

CREATE INDEX IF NOT EXISTS whatsapp_campaign_recipients_queue_idx
  ON public.whatsapp_campaign_recipients (campaign_id, status);

CREATE INDEX IF NOT EXISTS whatsapp_campaign_recipients_recent_sends_idx
  ON public.whatsapp_campaign_recipients (phone_key, sent_at DESC)
  WHERE status = 'sent';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_whatsapp_campaign_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_campaigns_set_updated_at ON public.whatsapp_campaigns;
CREATE TRIGGER whatsapp_campaigns_set_updated_at
  BEFORE UPDATE ON public.whatsapp_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_whatsapp_campaign_updated_at();

DROP TRIGGER IF EXISTS whatsapp_campaign_recipients_set_updated_at
  ON public.whatsapp_campaign_recipients;
CREATE TRIGGER whatsapp_campaign_recipients_set_updated_at
  BEFORE UPDATE ON public.whatsapp_campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_whatsapp_campaign_updated_at();

-- ---------------------------------------------------------------------------
-- Batch claiming
-- ---------------------------------------------------------------------------

-- Atomically hand a worker the next slice of pending recipients. SKIP LOCKED
-- means two overlapping serverless invocations get disjoint batches instead of
-- sending the same message twice.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_campaign_recipients(
  p_campaign_id uuid,
  p_limit integer
)
RETURNS SETOF public.whatsapp_campaign_recipients
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.whatsapp_campaign_recipients AS recipient
  SET status = 'sending',
      attempt_count = recipient.attempt_count + 1
  WHERE recipient.id IN (
    SELECT candidate.id
    FROM public.whatsapp_campaign_recipients AS candidate
    WHERE candidate.campaign_id = p_campaign_id
      AND candidate.status = 'pending'
    ORDER BY candidate.created_at
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING recipient.*;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_campaign_recipients(uuid, integer) FROM public;
REVOKE ALL ON FUNCTION public.claim_whatsapp_campaign_recipients(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_campaign_recipients(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: campaigns are admin-only, matching twilio_connections.
-- ---------------------------------------------------------------------------

ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_messaging_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'management', 'admission_manager')
  );
$$;

DROP POLICY IF EXISTS whatsapp_campaigns_admin_all ON public.whatsapp_campaigns;
CREATE POLICY whatsapp_campaigns_admin_all
  ON public.whatsapp_campaigns FOR ALL
  TO authenticated
  USING (public.is_messaging_admin())
  WITH CHECK (public.is_messaging_admin());

DROP POLICY IF EXISTS whatsapp_campaign_recipients_admin_all
  ON public.whatsapp_campaign_recipients;
CREATE POLICY whatsapp_campaign_recipients_admin_all
  ON public.whatsapp_campaign_recipients FOR ALL
  TO authenticated
  USING (public.is_messaging_admin())
  WITH CHECK (public.is_messaging_admin());

-- Counsellors need to see who opted out before messaging them by hand.
DROP POLICY IF EXISTS messaging_opt_outs_select_authenticated ON public.messaging_opt_outs;
CREATE POLICY messaging_opt_outs_select_authenticated
  ON public.messaging_opt_outs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS messaging_opt_outs_admin_write ON public.messaging_opt_outs;
CREATE POLICY messaging_opt_outs_admin_write
  ON public.messaging_opt_outs FOR ALL
  TO authenticated
  USING (public.is_messaging_admin())
  WITH CHECK (public.is_messaging_admin());
