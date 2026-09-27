-- Twilio Click-to-WhatsApp webhook referral fields (Referral* parameters).
-- Stored on leads and conversations; Graph-enriched campaign/ad set names stay separate.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_referral_source_type text,
  ADD COLUMN IF NOT EXISTS meta_referral_source_url text,
  ADD COLUMN IF NOT EXISTS meta_referral_media_id text,
  ADD COLUMN IF NOT EXISTS meta_referral_media_url text;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS meta_referral_source_type text,
  ADD COLUMN IF NOT EXISTS meta_referral_source_url text,
  ADD COLUMN IF NOT EXISTS meta_referral_media_id text,
  ADD COLUMN IF NOT EXISTS meta_referral_media_url text;

COMMENT ON COLUMN public.leads.meta_referral_source_id IS 'Twilio ReferralSourceId — Meta/WhatsApp ad ID';
COMMENT ON COLUMN public.leads.meta_referral_source_type IS 'Twilio ReferralSourceType (e.g. post)';
COMMENT ON COLUMN public.leads.meta_referral_headline IS 'Twilio ReferralHeadline';
COMMENT ON COLUMN public.leads.meta_referral_body IS 'Twilio ReferralBody';
COMMENT ON COLUMN public.leads.meta_referral_media_id IS 'Twilio ReferralMediaId';
COMMENT ON COLUMN public.leads.meta_referral_media_url IS 'Twilio ReferralMediaUrl';
COMMENT ON COLUMN public.leads.meta_ctwa_clid IS 'Twilio ReferralCtwaClid — Meta click ID for Conversions API';
