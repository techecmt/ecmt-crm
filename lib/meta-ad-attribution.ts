import "server-only";

import type { LeadSource } from "@/lib/types";

/** Raw Click-to-WhatsApp referral fields from a Twilio inbound webhook. */
/** Twilio inbound webhook Referral* fields for Click-to-WhatsApp ads. */
export type TwilioCtwaReferral = {
  /** ReferralCtwaClid */
  ctwaClid: string | null;
  /** ReferralSourceId */
  sourceId: string | null;
  /** ReferralSourceType */
  sourceType: string | null;
  /** ReferralHeadline */
  headline: string | null;
  /** ReferralBody */
  body: string | null;
  /** ReferralSourceUrl */
  sourceUrl: string | null;
  /** ReferralMediaId */
  mediaId: string | null;
  /** ReferralMediaUrl */
  mediaUrl: string | null;
};

export type MetaCtwaAttributionPatch = {
  source: string | null;
  source_platform: string | null;
  meta_campaign_id: string | null;
  meta_campaign_name: string | null;
  meta_adset_id: string | null;
  meta_adset_name: string | null;
  meta_ad_id: string | null;
  meta_ad_name: string | null;
  meta_ctwa_clid: string | null;
  meta_referral_source_id: string | null;
  meta_referral_source_type: string | null;
  meta_referral_source_url: string | null;
  meta_referral_headline: string | null;
  meta_referral_body: string | null;
  meta_referral_media_id: string | null;
  meta_referral_media_url: string | null;
  attribution_captured_at: string;
};

export function parseTwilioCtwaReferral(form: URLSearchParams): TwilioCtwaReferral | null {
  const ctwaClid = form.get("ReferralCtwaClid")?.trim() || null;
  const sourceId = form.get("ReferralSourceId")?.trim() || null;
  const headline = form.get("ReferralHeadline")?.trim() || null;
  const body = form.get("ReferralBody")?.trim() || null;
  const sourceType = form.get("ReferralSourceType")?.trim() || null;
  const sourceUrl = form.get("ReferralSourceUrl")?.trim() || null;
  const mediaId = form.get("ReferralMediaId")?.trim() || null;
  const mediaUrl = form.get("ReferralMediaUrl")?.trim() || null;

  if (!ctwaClid && !sourceId && !headline && !body && !sourceType && !mediaId) {
    return null;
  }

  return {
    ctwaClid,
    sourceId,
    sourceType,
    headline,
    body,
    sourceUrl,
    mediaId,
    mediaUrl,
  };
}

type MetaGraphAdNode = {
  id?: string;
  name?: string;
  campaign?: { id?: string; name?: string };
  adset?: { id?: string; name?: string };
};

export async function enrichMetaAdFromReferralSourceId(sourceId: string | null): Promise<{
  meta_campaign_id: string | null;
  meta_campaign_name: string | null;
  meta_adset_id: string | null;
  meta_adset_name: string | null;
  meta_ad_id: string | null;
  meta_ad_name: string | null;
}> {
  const empty = {
    meta_campaign_id: null,
    meta_campaign_name: null,
    meta_adset_id: null,
    meta_adset_name: null,
    meta_ad_id: null,
    meta_ad_name: null,
  };

  if (!sourceId) return empty;

  const token =
    process.env.META_MARKETING_ACCESS_TOKEN?.trim() ||
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim();
  if (!token) {
    console.warn("[Meta attribution] No Marketing API token configured");
    return {
      ...empty,
      meta_ad_id: sourceId,
    };
  }

  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
  const fields = "id,name,campaign{id,name},adset{id,name}";
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(sourceId)}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);

  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const payload = (await response.json()) as MetaGraphAdNode & { error?: { message?: string } };
    if (!response.ok || payload.error) {
      console.warn(
        "[Meta attribution] Graph lookup failed:",
        payload.error?.message ?? response.statusText,
      );
      return {
        ...empty,
        meta_ad_id: sourceId,
      };
    }

    return {
      meta_campaign_id: payload.campaign?.id ?? null,
      meta_campaign_name: payload.campaign?.name ?? null,
      meta_adset_id: payload.adset?.id ?? null,
      meta_adset_name: payload.adset?.name ?? null,
      meta_ad_id: payload.id ?? sourceId,
      meta_ad_name: payload.name ?? null,
    };
  } catch (error) {
    console.warn("[Meta attribution] Graph request error:", error);
    return {
      ...empty,
      meta_ad_id: sourceId,
    };
  }
}

export async function buildMetaCtwaAttributionPatch(
  referral: TwilioCtwaReferral,
): Promise<MetaCtwaAttributionPatch> {
  const enriched = await enrichMetaAdFromReferralSourceId(referral.sourceId);
  const capturedAt = new Date().toISOString();

  return {
    source: "meta_ads",
    source_platform: "meta",
    meta_campaign_id: enriched.meta_campaign_id,
    meta_campaign_name: enriched.meta_campaign_name,
    meta_adset_id: enriched.meta_adset_id,
    meta_adset_name: enriched.meta_adset_name,
    meta_ad_id: enriched.meta_ad_id ?? referral.sourceId,
    meta_ad_name: enriched.meta_ad_name,
    meta_ctwa_clid: referral.ctwaClid,
    meta_referral_source_id: referral.sourceId,
    meta_referral_source_type: referral.sourceType,
    meta_referral_source_url: referral.sourceUrl,
    meta_referral_headline: referral.headline,
    meta_referral_body: referral.body,
    meta_referral_media_id: referral.mediaId,
    meta_referral_media_url: referral.mediaUrl,
    attribution_captured_at: capturedAt,
  };
}

export function leadAttributionFromPatch(
  patch: MetaCtwaAttributionPatch,
): Record<string, unknown> {
  const campaignLabel =
    patch.meta_campaign_name?.trim() ||
    patch.meta_referral_headline?.trim() ||
    null;

  return {
    source: "meta_ads" satisfies LeadSource,
    source_platform: patch.source_platform,
    meta_campaign_id: patch.meta_campaign_id,
    meta_campaign_name: patch.meta_campaign_name,
    meta_adset_id: patch.meta_adset_id,
    meta_adset_name: patch.meta_adset_name,
    meta_ad_id: patch.meta_ad_id,
    meta_ad_name: patch.meta_ad_name,
    meta_ctwa_clid: patch.meta_ctwa_clid,
    meta_referral_source_id: patch.meta_referral_source_id,
    meta_referral_source_type: patch.meta_referral_source_type,
    meta_referral_source_url: patch.meta_referral_source_url,
    meta_referral_headline: patch.meta_referral_headline,
    meta_referral_body: patch.meta_referral_body,
    meta_referral_media_id: patch.meta_referral_media_id,
    meta_referral_media_url: patch.meta_referral_media_url,
    attribution_captured_at: patch.attribution_captured_at,
    ...(campaignLabel ? { campaign: campaignLabel } : {}),
  };
}
