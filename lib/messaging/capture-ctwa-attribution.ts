import "server-only";

import {
  buildMetaCtwaAttributionPatch,
  leadAttributionFromPatch,
  type MetaCtwaAttributionPatch,
  type TwilioCtwaReferral,
} from "@/lib/meta-ad-attribution";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Persists Click-to-WhatsApp referral on the conversation (first touch only),
 * enriches via Meta Graph when possible, and syncs to a linked lead if the lead
 * has no attribution yet.
 */
export async function captureCtwaAttributionForConversation(input: {
  supabase: AdminClient;
  conversationId: string;
  leadId: string | null;
  existingAttributionCapturedAt: string | null;
  referral: TwilioCtwaReferral;
}): Promise<MetaCtwaAttributionPatch | null> {
  if (input.existingAttributionCapturedAt) {
    return null;
  }

  const patch = await buildMetaCtwaAttributionPatch(input.referral);

  const { error: conversationError } = await input.supabase
    .from("conversations")
    .update(patch)
    .eq("id", input.conversationId)
    .is("attribution_captured_at", null);

  if (conversationError) {
    console.error("[Meta attribution] Failed to update conversation:", conversationError.message);
    return null;
  }

  if (input.leadId) {
    await syncCtwaAttributionToLead({
      supabase: input.supabase,
      leadId: input.leadId,
      patch,
    });
  }

  return patch;
}

export async function syncCtwaAttributionToLead(input: {
  supabase: AdminClient;
  leadId: string;
  patch: MetaCtwaAttributionPatch;
}) {
  const leadPatch = leadAttributionFromPatch(input.patch);
  const { error } = await input.supabase
    .from("leads")
    .update(leadPatch)
    .eq("id", input.leadId)
    .is("attribution_captured_at", null);

  if (error) {
    console.error("[Meta attribution] Failed to update lead:", error.message);
  }
}

export async function syncConversationAttributionToLead(
  supabase: AdminClient,
  conversationId: string,
  leadId: string,
) {
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "attribution_captured_at, source, source_platform, meta_campaign_id, meta_campaign_name, meta_adset_id, meta_adset_name, meta_ad_id, meta_ad_name, meta_ctwa_clid, meta_referral_source_id, meta_referral_source_type, meta_referral_source_url, meta_referral_headline, meta_referral_body, meta_referral_media_id, meta_referral_media_url",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation?.attribution_captured_at) return;

  await syncCtwaAttributionToLead({
    supabase,
    leadId,
    patch: {
      source: conversation.source ?? "meta_ads",
      source_platform: conversation.source_platform ?? "meta",
      meta_campaign_id: conversation.meta_campaign_id ?? null,
      meta_campaign_name: conversation.meta_campaign_name ?? null,
      meta_adset_id: conversation.meta_adset_id ?? null,
      meta_adset_name: conversation.meta_adset_name ?? null,
      meta_ad_id: conversation.meta_ad_id ?? null,
      meta_ad_name: conversation.meta_ad_name ?? null,
      meta_ctwa_clid: conversation.meta_ctwa_clid ?? null,
      meta_referral_source_id: conversation.meta_referral_source_id ?? null,
      meta_referral_source_type: conversation.meta_referral_source_type ?? null,
      meta_referral_source_url: conversation.meta_referral_source_url ?? null,
      meta_referral_headline: conversation.meta_referral_headline ?? null,
      meta_referral_body: conversation.meta_referral_body ?? null,
      meta_referral_media_id: conversation.meta_referral_media_id ?? null,
      meta_referral_media_url: conversation.meta_referral_media_url ?? null,
      attribution_captured_at: conversation.attribution_captured_at,
    },
  });
}
