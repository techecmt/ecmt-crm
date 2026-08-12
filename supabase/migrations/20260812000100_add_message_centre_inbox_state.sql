-- Shared inbox state: unread tracking and an indexed source of truth for the
-- latest message. Existing conversations begin read to avoid a noisy rollout.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_role text;

UPDATE public.conversations
SET unread_count = 0
WHERE unread_count IS NULL;

WITH latest_messages AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    created_at,
    left(content, 280) AS preview,
    role
  FROM public.messages
  ORDER BY conversation_id, created_at DESC, id DESC
)
UPDATE public.conversations AS conversation
SET
  last_message_at = latest.created_at,
  last_message_preview = latest.preview,
  last_message_role = latest.role
FROM latest_messages AS latest
WHERE conversation.id = latest.conversation_id
  AND (
    conversation.last_message_at IS NULL
    OR conversation.last_message_at < latest.created_at
  );

CREATE OR REPLACE FUNCTION public.sync_conversation_message_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = left(NEW.content, 280),
    last_message_role = NEW.role,
    unread_count = CASE
      WHEN NEW.role = 'user' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_sync_conversation_summary ON public.messages;
CREATE TRIGGER messages_sync_conversation_summary
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_conversation_message_summary();

CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx
  ON public.conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS conversations_actionable_inbox_idx
  ON public.conversations (status, unread_count DESC, last_message_at DESC NULLS LAST)
  WHERE status IN ('open', 'pending');

-- The previous unique index omitted provider, which caused a Meta and Twilio
-- conversation for the same WhatsApp user to conflict.
DROP INDEX IF EXISTS public.conversations_channel_page_external_user_idx;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_provider_external_user_idx
  ON public.conversations (
    channel,
    provider,
    COALESCE(page_id, ''),
    external_user_id
  );
