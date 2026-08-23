-- Multi-agent Message Centre foundation:
-- - Each agent has independent AI settings and knowledge.
-- - Meta and Twilio connections are assigned to one agent.
-- - Twilio supports multiple credential sets/senders.

CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Admissions Assistant',
  system_prompt text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT 'openai/gpt-4o-mini',
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 500,
  persona text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'professional_friendly'
    CHECK (tone IN ('professional_friendly', 'formal', 'casual', 'empathetic')),
  greeting_message text NOT NULL DEFAULT '',
  fallback_message text NOT NULL DEFAULT '',
  escalation_enabled boolean NOT NULL DEFAULT true,
  escalation_keywords text[] NOT NULL DEFAULT '{}'::text[],
  escalation_message text NOT NULL DEFAULT '',
  auto_collect_lead boolean NOT NULL DEFAULT false,
  lead_collect_fields text[] NOT NULL DEFAULT ARRAY['name', 'phone', 'email', 'course'],
  business_hours_enabled boolean NOT NULL DEFAULT false,
  business_hours jsonb NOT NULL DEFAULT '{"timezone":"Asia/Singapore","days":{}}'::jsonb,
  offline_message text NOT NULL DEFAULT '',
  response_delay_ms integer NOT NULL DEFAULT 0,
  max_history_messages integer NOT NULL DEFAULT 20,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_single_default_true_idx
  ON public.ai_agents (is_default)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS public.twilio_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  account_sid text NOT NULL,
  auth_token text NOT NULL,
  whatsapp_from text,
  messaging_service_sid text,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT twilio_connection_sender_required
    CHECK (
      COALESCE(NULLIF(trim(whatsapp_from), ''), NULLIF(trim(messaging_service_sid), '')) IS NOT NULL
    )
);

ALTER TABLE public.ai_knowledge
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE;

ALTER TABLE public.messaging_pages
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS twilio_connection_id uuid REFERENCES public.twilio_connections(id) ON DELETE SET NULL;

DO $$
DECLARE
  v_default_agent_id uuid;
  v_ai_settings_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ai_settings'
  ) INTO v_ai_settings_table_exists;

  IF v_ai_settings_table_exists THEN
    EXECUTE $sql$
      INSERT INTO public.ai_agents (
        name,
        system_prompt,
        model,
        temperature,
        max_tokens,
        persona,
        tone,
        greeting_message,
        fallback_message,
        escalation_enabled,
        escalation_keywords,
        escalation_message,
        auto_collect_lead,
        lead_collect_fields,
        business_hours_enabled,
        business_hours,
        offline_message,
        response_delay_ms,
        max_history_messages,
        is_active,
        is_default
      )
      SELECT
        COALESCE(NULLIF(trim(agent_name), ''), 'Admissions Assistant') AS name,
        COALESCE(system_prompt, '') AS system_prompt,
        COALESCE(model, 'openai/gpt-4o-mini') AS model,
        COALESCE(temperature, 0.7) AS temperature,
        COALESCE(max_tokens, 500) AS max_tokens,
        COALESCE(persona, '') AS persona,
        COALESCE(tone, 'professional_friendly') AS tone,
        COALESCE(greeting_message, '') AS greeting_message,
        COALESCE(fallback_message, '') AS fallback_message,
        COALESCE(escalation_enabled, true) AS escalation_enabled,
        COALESCE(escalation_keywords, '{}'::text[]) AS escalation_keywords,
        COALESCE(escalation_message, '') AS escalation_message,
        COALESCE(auto_collect_lead, false) AS auto_collect_lead,
        COALESCE(lead_collect_fields, ARRAY['name', 'phone', 'email', 'course']) AS lead_collect_fields,
        COALESCE(business_hours_enabled, false) AS business_hours_enabled,
        COALESCE(business_hours, '{"timezone":"Asia/Singapore","days":{}}'::jsonb) AS business_hours,
        COALESCE(offline_message, '') AS offline_message,
        COALESCE(response_delay_ms, 0) AS response_delay_ms,
        COALESCE(max_history_messages, 20) AS max_history_messages,
        COALESCE(is_active, true) AS is_active,
        true AS is_default
      FROM public.ai_settings
      WHERE id = true
      ON CONFLICT DO NOTHING
    $sql$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ai_agents) THEN
    INSERT INTO public.ai_agents (name, is_default)
    VALUES ('Admissions Assistant', true);
  END IF;

  SELECT id INTO v_default_agent_id
  FROM public.ai_agents
  WHERE is_default = true
  LIMIT 1;

  UPDATE public.ai_knowledge
  SET agent_id = v_default_agent_id
  WHERE agent_id IS NULL;

  UPDATE public.messaging_pages
  SET agent_id = v_default_agent_id
  WHERE agent_id IS NULL;

  UPDATE public.conversations
  SET ai_agent_id = v_default_agent_id
  WHERE ai_agent_id IS NULL;

  UPDATE public.conversations AS conversation
  SET ai_agent_id = page.agent_id
  FROM public.messaging_pages AS page
  WHERE conversation.channel IN ('messenger', 'whatsapp')
    AND conversation.provider = 'meta'
    AND conversation.page_id = page.page_id
    AND page.agent_id IS NOT NULL;
END $$;

ALTER TABLE public.ai_knowledge
  ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE public.messaging_pages
  ALTER COLUMN agent_id SET NOT NULL;

DROP INDEX IF EXISTS public.conversations_channel_provider_external_user_idx;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_provider_connection_external_user_idx
  ON public.conversations (
    channel,
    provider,
    COALESCE(page_id, ''),
    COALESCE(twilio_connection_id::text, ''),
    external_user_id
  );

CREATE INDEX IF NOT EXISTS ai_knowledge_agent_sort_idx
  ON public.ai_knowledge (agent_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS messaging_pages_agent_channel_idx
  ON public.messaging_pages (agent_id, channel, is_active);

CREATE INDEX IF NOT EXISTS twilio_connections_agent_active_idx
  ON public.twilio_connections (agent_id, is_active);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twilio_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_agents_select_authenticated ON public.ai_agents;
CREATE POLICY ai_agents_select_authenticated
  ON public.ai_agents FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ai_agents_insert_authenticated ON public.ai_agents;
CREATE POLICY ai_agents_insert_authenticated
  ON public.ai_agents FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_agents_update_authenticated ON public.ai_agents;
CREATE POLICY ai_agents_update_authenticated
  ON public.ai_agents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_agents_delete_authenticated ON public.ai_agents;
CREATE POLICY ai_agents_delete_authenticated
  ON public.ai_agents FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS twilio_connections_select_authenticated ON public.twilio_connections;
DROP POLICY IF EXISTS twilio_connections_select_admin ON public.twilio_connections;
CREATE POLICY twilio_connections_select_admin
  ON public.twilio_connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'management', 'admission_manager')
    )
  );

DROP POLICY IF EXISTS twilio_connections_insert_authenticated ON public.twilio_connections;
DROP POLICY IF EXISTS twilio_connections_insert_admin ON public.twilio_connections;
CREATE POLICY twilio_connections_insert_admin
  ON public.twilio_connections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'management', 'admission_manager')
    )
  );

DROP POLICY IF EXISTS twilio_connections_update_authenticated ON public.twilio_connections;
DROP POLICY IF EXISTS twilio_connections_update_admin ON public.twilio_connections;
CREATE POLICY twilio_connections_update_admin
  ON public.twilio_connections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'management', 'admission_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'management', 'admission_manager')
    )
  );

DROP POLICY IF EXISTS twilio_connections_delete_authenticated ON public.twilio_connections;
DROP POLICY IF EXISTS twilio_connections_delete_admin ON public.twilio_connections;
CREATE POLICY twilio_connections_delete_admin
  ON public.twilio_connections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'management', 'admission_manager')
    )
  );
