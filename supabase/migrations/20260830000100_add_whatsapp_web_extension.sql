-- WhatsApp Web companion extension.
--
-- Counsellor WhatsApp Web chats are imported into the existing Message Centre
-- model rather than a parallel table: they become `conversations` rows on the
-- `whatsapp` channel with a new `whatsapp_web` provider, so the lead detail
-- Messages tab renders them with no new UI surface.
--
-- Additive and safe on the current production-shaped schema. Official Meta and
-- Twilio WhatsApp rows are untouched.

-- 1. Allow the new provider alongside the existing Business API providers.
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_provider_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_provider_check
  CHECK (provider IN ('meta', 'twilio', 'whatsapp_web'));

-- 2. Make imported-message de-duplication authoritative in the database.
--    Inbound webhooks already dedupe on external_msg_id in application code;
--    the extension import reuses the same key. Historical rows may contain
--    duplicates, so the index is only created when the data allows it — the
--    import path always performs its own pre-insert filtering.
DO $$
DECLARE
  v_duplicate_keys bigint;
BEGIN
  SELECT count(*) INTO v_duplicate_keys
  FROM (
    SELECT external_msg_id
    FROM public.messages
    WHERE external_msg_id IS NOT NULL
    GROUP BY external_msg_id
    HAVING count(*) > 1
  ) AS duplicates;

  IF v_duplicate_keys > 0 THEN
    RAISE WARNING
      'messages.external_msg_id has % duplicated value(s); unique index not created. De-duplicate and re-run this migration to enforce it in the database.',
      v_duplicate_keys;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS messages_external_msg_id_key
      ON public.messages (external_msg_id)
      WHERE external_msg_id IS NOT NULL;
  END IF;
END $$;

-- 3. Phone lookup drives every extension request (single chat and chat-list
--    batch). Only add the index when leads(phone_key) is not already indexed,
--    so a fresh clone gains it without duplicating an existing production index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS i
    JOIN pg_attribute AS a
      ON a.attrelid = i.indrelid
     AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.leads'::regclass
      AND a.attname = 'phone_key'
  ) THEN
    CREATE INDEX leads_phone_key_lookup_idx
      ON public.leads (phone_key)
      WHERE phone_key IS NOT NULL;
  END IF;
END $$;
