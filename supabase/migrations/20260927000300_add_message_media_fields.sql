-- WhatsApp rich media support in Message Centre inbox.
-- Stores one optional media attachment per message (image or document/PDF).
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS provider_media_id text,
  ADD COLUMN IF NOT EXISTS template_content_sid text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_media_type_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_media_type_check
      CHECK (media_type IS NULL OR media_type IN ('image', 'document'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_conversation_media_idx
  ON public.messages (conversation_id, created_at DESC)
  WHERE media_type IS NOT NULL;
