ALTER TABLE public.callback_requests
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS callback_requests_conversation_created_idx
  ON public.callback_requests (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS callback_requests_agent_created_idx
  ON public.callback_requests (agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;
