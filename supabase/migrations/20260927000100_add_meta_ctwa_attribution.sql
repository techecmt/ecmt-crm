-- Click-to-WhatsApp (Meta ads) attribution from Twilio inbound webhooks.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_campaign_name text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_name text,
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_name text,
  ADD COLUMN IF NOT EXISTS meta_ctwa_clid text,
  ADD COLUMN IF NOT EXISTS meta_referral_source_id text,
  ADD COLUMN IF NOT EXISTS meta_referral_headline text,
  ADD COLUMN IF NOT EXISTS meta_referral_body text,
  ADD COLUMN IF NOT EXISTS attribution_captured_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_campaign_name text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_name text,
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_name text,
  ADD COLUMN IF NOT EXISTS meta_ctwa_clid text,
  ADD COLUMN IF NOT EXISTS meta_referral_source_id text,
  ADD COLUMN IF NOT EXISTS meta_referral_headline text,
  ADD COLUMN IF NOT EXISTS meta_referral_body text,
  ADD COLUMN IF NOT EXISTS attribution_captured_at timestamptz;

CREATE INDEX IF NOT EXISTS conversations_meta_campaign_id_idx
  ON public.conversations (meta_campaign_id)
  WHERE meta_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_meta_campaign_id_idx
  ON public.leads (meta_campaign_id)
  WHERE meta_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_meta_adset_id_idx
  ON public.leads (meta_adset_id)
  WHERE meta_adset_id IS NOT NULL;
