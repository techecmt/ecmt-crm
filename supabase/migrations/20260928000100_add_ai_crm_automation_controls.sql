-- AI CRM Automation controls, approval queue, and immutable audit logs.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS crm_automation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_automation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outbound_whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outbound_policy text NOT NULL DEFAULT 'session_only'
    CHECK (outbound_policy IN ('session_only', 'disabled')),
  ADD COLUMN IF NOT EXISTS auto_apply_explicit_fields text[] NOT NULL DEFAULT ARRAY['name', 'email', 'phone', 'course'],
  ADD COLUMN IF NOT EXISTS inference_allowed_fields text[] NOT NULL DEFAULT ARRAY['city', 'course'],
  ADD COLUMN IF NOT EXISTS require_status_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inference_min_confidence numeric NOT NULL DEFAULT 0.75;

CREATE TABLE IF NOT EXISTS public.ai_status_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  current_status text NOT NULL,
  proposed_status text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by text NOT NULL DEFAULT 'ai',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_status_change_requests_state_created_idx
  ON public.ai_status_change_requests (state, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_status_change_requests_conversation_idx
  ON public.ai_status_change_requests (conversation_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_status_change_requests_lead_idx
  ON public.ai_status_change_requests (lead_id, state, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ai_status_change_requests_pending_unique_idx
  ON public.ai_status_change_requests (conversation_id, proposed_status)
  WHERE state = 'pending' AND conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_action_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  action_status text NOT NULL DEFAULT 'applied'
    CHECK (action_status IN ('applied', 'skipped', 'queued', 'failed')),
  field_name text,
  previous_value jsonb,
  next_value jsonb,
  reason text,
  confidence numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_action_audit_logs_conversation_idx
  ON public.ai_action_audit_logs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_action_audit_logs_lead_idx
  ON public.ai_action_audit_logs (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_action_audit_logs_action_type_idx
  ON public.ai_action_audit_logs (action_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_ai_status_change_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_status_change_requests_set_updated_at ON public.ai_status_change_requests;
CREATE TRIGGER ai_status_change_requests_set_updated_at
  BEFORE UPDATE ON public.ai_status_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ai_status_change_requests_updated_at();

ALTER TABLE public.ai_status_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_status_change_requests_select_authenticated ON public.ai_status_change_requests;
CREATE POLICY ai_status_change_requests_select_authenticated
  ON public.ai_status_change_requests FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ai_status_change_requests_insert_authenticated ON public.ai_status_change_requests;
CREATE POLICY ai_status_change_requests_insert_authenticated
  ON public.ai_status_change_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_status_change_requests_update_authenticated ON public.ai_status_change_requests;
CREATE POLICY ai_status_change_requests_update_authenticated
  ON public.ai_status_change_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_action_audit_logs_select_authenticated ON public.ai_action_audit_logs;
CREATE POLICY ai_action_audit_logs_select_authenticated
  ON public.ai_action_audit_logs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ai_action_audit_logs_insert_authenticated ON public.ai_action_audit_logs;
CREATE POLICY ai_action_audit_logs_insert_authenticated
  ON public.ai_action_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
