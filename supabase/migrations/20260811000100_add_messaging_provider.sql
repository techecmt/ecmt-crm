-- Distinguish Meta and Twilio conversations without changing the shared
-- WhatsApp Message Centre experience.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS provider text;

UPDATE public.conversations
SET provider = 'meta'
WHERE provider IS NULL;

ALTER TABLE public.conversations
  ALTER COLUMN provider SET DEFAULT 'meta',
  ALTER COLUMN provider SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_provider_check'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_provider_check
      CHECK (provider IN ('meta', 'twilio'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversations_provider_lookup_idx
  ON public.conversations (channel, provider, external_user_id, page_id);
