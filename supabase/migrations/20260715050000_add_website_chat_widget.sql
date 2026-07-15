-- Website chat is intentionally isolated from the existing leads and colleges modules.
-- Visitor capture and qualification data live on conversations.

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'messenger', 'website'));

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS lifecycle_status text
    CHECK (
      lifecycle_status IS NULL
      OR lifecycle_status IN (
        'new',
        'bot_handled',
        'escalation_requested',
        'human_handled',
        'closed'
      )
    ),
  ADD COLUMN IF NOT EXISTS bot_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visitor_token_hash text,
  ADD COLUMN IF NOT EXISTS visitor_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS escalation_requested_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_visitor_token_hash_key
  ON public.conversations (visitor_token_hash)
  WHERE visitor_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_website_lifecycle_updated_idx
  ON public.conversations (lifecycle_status, updated_at DESC)
  WHERE channel = 'website';

CREATE TABLE IF NOT EXISTS public.website_widget_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  public_key text NOT NULL UNIQUE,
  allowed_origins text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.website_widget_config (id, public_key)
VALUES (true, encode(gen_random_bytes(18), 'hex'))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.website_widget_config ENABLE ROW LEVEL SECURITY;
