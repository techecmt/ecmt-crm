import "server-only";

import {
  renderTemplateBody,
  type CampaignAudienceSnapshot,
  type CampaignVariableMapping,
  type WhatsAppCampaign,
  type WhatsAppCampaignRecipient,
} from "@/lib/campaigns";
import { canonicalizePhoneKey } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";
import { sendTwilioWhatsAppTemplate, type TwilioConnectionCredentials } from "./twilio";

/** Recipients handled per worker invocation; keeps us well inside a serverless timeout. */
export const CAMPAIGN_BATCH_SIZE = Number(process.env.CAMPAIGN_BATCH_SIZE || 25);
/** Gap between sends, so a burst does not trip Twilio's per-second limits. */
export const CAMPAIGN_SEND_INTERVAL_MS = Number(process.env.CAMPAIGN_SEND_INTERVAL_MS || 250);
/** Hard ceiling on how many recipients one campaign may ever target. */
export const CAMPAIGN_MAX_RECIPIENTS = Number(process.env.CAMPAIGN_MAX_RECIPIENTS || 5000);

type AdminClient = ReturnType<typeof createAdminClient>;

export type CampaignLeadRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  nationality: string | null;
  interested_course: string | null;
  status: LeadStatus | null;
  assigned_counsellor: string | null;
  do_not_contact: boolean | null;
};

export type CampaignCandidate = {
  leadId: string | null;
  conversationId: string | null;
  phone: string;
  fullName: string | null;
  lead: CampaignLeadRow | null;
};

export type CampaignBuildSummary = {
  queued: number;
  skippedOptedOut: number;
  skippedRecentlyMessaged: number;
  skippedDuplicate: number;
  skippedInvalidPhone: number;
  skippedOverCap: number;
};

function delay(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Values a template variable can be bound to for one recipient. */
export function leadFieldValues(candidate: CampaignCandidate, counsellorName: string | null) {
  const lead = candidate.lead;
  const fullName = lead?.full_name || candidate.fullName || "";
  return {
    full_name: fullName,
    first_name: lead?.first_name || fullName.split(" ")[0] || "",
    phone: lead?.phone || candidate.phone,
    email: lead?.email || "",
    city: lead?.city || "",
    nationality: lead?.nationality || "",
    interested_course: lead?.interested_course || "",
    counsellor_name: counsellorName || "",
    status_label: lead?.status ? (LEAD_STATUS_LABELS[lead.status] ?? "") : "",
  } as Record<string, string>;
}

export function resolveCampaignVariables(
  mapping: CampaignVariableMapping,
  candidate: CampaignCandidate,
  counsellorName: string | null,
) {
  const fields = leadFieldValues(candidate, counsellorName);
  const resolved: Record<string, string> = {};

  for (const [key, binding] of Object.entries(mapping ?? {})) {
    if (!binding) continue;
    const value =
      binding.source === "static" ? binding.value : (fields[binding.value] ?? "");
    // Twilio rejects empty content variables, so fall back to a space-free blank.
    resolved[key] = String(value ?? "").trim();
  }

  return resolved;
}

async function loadCounsellorNames(supabase: AdminClient, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);

  return new Map(
    (data ?? []).map((profile) => [
      profile.id as string,
      (profile.full_name as string | null) || (profile.email as string) || "",
    ]),
  );
}

/** Candidates from an explicit set of lead ids. */
export async function candidatesFromLeads(supabase: AdminClient, leadIds: string[]) {
  if (!leadIds.length) return [] as CampaignCandidate[];

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, full_name, first_name, phone, email, city, nationality, interested_course, status, assigned_counsellor, do_not_contact",
    )
    .in("id", leadIds);
  if (error) throw new Error(error.message);

  return (data ?? []).map((lead) => ({
    leadId: lead.id as string,
    conversationId: null,
    phone: (lead.phone as string | null) ?? "",
    fullName: (lead.full_name as string | null) ?? null,
    lead: lead as CampaignLeadRow,
  })) satisfies CampaignCandidate[];
}

/** Candidates from existing WhatsApp conversations, enriched with lead data. */
export async function candidatesFromConversations(
  supabase: AdminClient,
  conversationIds: string[],
) {
  if (!conversationIds.length) return [] as CampaignCandidate[];

  const { data, error } = await supabase
    .from("conversations")
    .select("id, phone, external_user_id, name, lead_id, channel")
    .in("id", conversationIds)
    .eq("channel", "whatsapp");
  if (error) throw new Error(error.message);

  const conversations = data ?? [];
  const leadIds = conversations
    .map((conversation) => conversation.lead_id as string | null)
    .filter((id): id is string => Boolean(id));

  const leadsById = new Map<string, CampaignLeadRow>();
  if (leadIds.length) {
    const { data: leads } = await supabase
      .from("leads")
      .select(
        "id, full_name, first_name, phone, email, city, nationality, interested_course, status, assigned_counsellor, do_not_contact",
      )
      .in("id", [...new Set(leadIds)]);
    for (const lead of leads ?? []) {
      leadsById.set(lead.id as string, lead as CampaignLeadRow);
    }
  }

  return conversations.map((conversation) => {
    const lead = conversation.lead_id
      ? (leadsById.get(conversation.lead_id as string) ?? null)
      : null;
    return {
      leadId: (conversation.lead_id as string | null) ?? null,
      conversationId: conversation.id as string,
      phone:
        (conversation.phone as string | null) ||
        (conversation.external_user_id as string) ||
        "",
      fullName: (conversation.name as string | null) ?? null,
      lead,
    };
  }) satisfies CampaignCandidate[];
}

/**
 * Turns candidates into recipient rows: deduplicated by phone, opt-outs and
 * recently-messaged contacts recorded as skipped, and the send cap applied.
 */
export async function materialiseCampaignRecipients(input: {
  supabase: AdminClient;
  campaignId: string;
  candidates: CampaignCandidate[];
  mapping: CampaignVariableMapping;
  sendCap: number | null;
  skipRecentDays: number | null;
}): Promise<CampaignBuildSummary> {
  const { supabase, campaignId, candidates, mapping } = input;
  const summary: CampaignBuildSummary = {
    queued: 0,
    skippedOptedOut: 0,
    skippedRecentlyMessaged: 0,
    skippedDuplicate: 0,
    skippedInvalidPhone: 0,
    skippedOverCap: 0,
  };

  const counsellorNames = await loadCounsellorNames(
    supabase,
    candidates.map((candidate) => candidate.lead?.assigned_counsellor ?? null),
  );

  // Deduplicate by canonical phone, keeping the first occurrence.
  const byPhoneKey = new Map<string, CampaignCandidate>();
  for (const candidate of candidates) {
    const phoneKey = canonicalizePhoneKey(candidate.phone);
    if (!phoneKey) {
      summary.skippedInvalidPhone += 1;
      continue;
    }
    if (byPhoneKey.has(phoneKey)) {
      summary.skippedDuplicate += 1;
      continue;
    }
    byPhoneKey.set(phoneKey, candidate);
  }

  const phoneKeys = [...byPhoneKey.keys()];
  const optedOut = await loadOptedOutPhoneKeys(supabase, phoneKeys);
  const recentlyMessaged = input.skipRecentDays
    ? await loadRecentlyMessagedPhoneKeys(supabase, phoneKeys, input.skipRecentDays)
    : new Set<string>();

  type RecipientInsert = {
    campaign_id: string;
    lead_id: string | null;
    conversation_id: string | null;
    phone: string;
    phone_key: string;
    full_name: string | null;
    variables: Record<string, string>;
    status: "pending" | "skipped";
    skip_reason: string | null;
  };

  const rows: RecipientInsert[] = [];
  for (const [phoneKey, candidate] of byPhoneKey) {
    const counsellorName = candidate.lead?.assigned_counsellor
      ? (counsellorNames.get(candidate.lead.assigned_counsellor) ?? null)
      : null;

    const base = {
      campaign_id: campaignId,
      lead_id: candidate.leadId,
      conversation_id: candidate.conversationId,
      phone: phoneKey,
      phone_key: phoneKey,
      full_name: candidate.lead?.full_name ?? candidate.fullName ?? null,
      variables: resolveCampaignVariables(mapping, candidate, counsellorName),
    };

    if (candidate.lead?.do_not_contact) {
      rows.push({ ...base, status: "skipped", skip_reason: "do_not_contact" });
      summary.skippedOptedOut += 1;
      continue;
    }
    if (optedOut.has(phoneKey)) {
      rows.push({ ...base, status: "skipped", skip_reason: "opted_out" });
      summary.skippedOptedOut += 1;
      continue;
    }
    if (recentlyMessaged.has(phoneKey)) {
      rows.push({ ...base, status: "skipped", skip_reason: "recently_messaged" });
      summary.skippedRecentlyMessaged += 1;
      continue;
    }

    const cap = input.sendCap;
    if (cap !== null && summary.queued >= cap) {
      summary.skippedOverCap += 1;
      continue;
    }

    rows.push({ ...base, status: "pending", skip_reason: null });
    summary.queued += 1;
  }

  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const { error } = await supabase.from("whatsapp_campaign_recipients").insert(chunk);
    if (error) throw new Error(error.message);
  }

  return summary;
}

async function loadOptedOutPhoneKeys(supabase: AdminClient, phoneKeys: string[]) {
  const optedOut = new Set<string>();
  for (let index = 0; index < phoneKeys.length; index += 500) {
    const chunk = phoneKeys.slice(index, index + 500);
    const { data } = await supabase
      .from("messaging_opt_outs")
      .select("phone_key")
      .in("phone_key", chunk);
    for (const row of data ?? []) optedOut.add(row.phone_key as string);
  }
  return optedOut;
}

async function loadRecentlyMessagedPhoneKeys(
  supabase: AdminClient,
  phoneKeys: string[],
  days: number,
) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const recent = new Set<string>();
  for (let index = 0; index < phoneKeys.length; index += 500) {
    const chunk = phoneKeys.slice(index, index + 500);
    const { data } = await supabase
      .from("whatsapp_campaign_recipients")
      .select("phone_key")
      .eq("status", "sent")
      .gte("sent_at", since)
      .in("phone_key", chunk);
    for (const row of data ?? []) recent.add(row.phone_key as string);
  }
  return recent;
}

async function loadConnectionCredentials(supabase: AdminClient, connectionId: string) {
  const { data, error } = await supabase
    .from("twilio_connections")
    .select("account_sid, auth_token, whatsapp_from, messaging_service_sid, is_active")
    .eq("id", connectionId)
    .single();
  if (error || !data) throw new Error("Twilio connection not found");
  if (!data.is_active) throw new Error("Twilio connection is inactive");
  return data as TwilioConnectionCredentials & { is_active: boolean };
}

/** Finds or creates the inbox thread a campaign message should appear in. */
async function ensureConversation(input: {
  supabase: AdminClient;
  campaign: WhatsAppCampaign;
  recipient: WhatsAppCampaignRecipient;
}) {
  const { supabase, campaign, recipient } = input;
  if (recipient.conversation_id) return recipient.conversation_id;

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("channel", "whatsapp")
    .eq("provider", "twilio")
    .eq("twilio_connection_id", campaign.twilio_connection_id)
    .eq("external_user_id", recipient.phone_key)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: connection } = await supabase
    .from("twilio_connections")
    .select("agent_id")
    .eq("id", campaign.twilio_connection_id)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      channel: "whatsapp",
      provider: "twilio",
      twilio_connection_id: campaign.twilio_connection_id,
      external_user_id: recipient.phone_key,
      phone: recipient.phone_key,
      name: recipient.full_name,
      lead_id: recipient.lead_id,
      ai_agent_id: (connection?.agent_id as string | null) ?? null,
      status: "open",
      mode: "human",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Campaign] Failed to create conversation:", error.message);
    return null;
  }
  return created.id as string;
}

export type CampaignBatchResult = {
  processed: number;
  sent: number;
  failed: number;
  remaining: number;
  status: WhatsAppCampaign["status"];
};

/**
 * Sends one batch of a campaign. Safe to call concurrently: recipients are
 * claimed atomically, so overlapping workers never send the same row twice.
 */
export async function processCampaignBatch(campaignId: string): Promise<CampaignBatchResult> {
  const supabase = createAdminClient();

  const { data: campaignRow, error: campaignError } = await supabase
    .from("whatsapp_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaignRow) throw new Error("Campaign not found");

  const campaign = campaignRow as unknown as WhatsAppCampaign;
  if (campaign.status !== "queued" && campaign.status !== "sending") {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      remaining: await countPending(supabase, campaignId),
      status: campaign.status,
    };
  }

  if (campaign.status === "queued") {
    await supabase
      .from("whatsapp_campaigns")
      .update({ status: "sending", started_at: campaign.started_at ?? new Date().toISOString() })
      .eq("id", campaignId);
  }

  let credentials: TwilioConnectionCredentials;
  try {
    credentials = await loadConnectionCredentials(supabase, campaign.twilio_connection_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Twilio connection unavailable";
    await failCampaign(supabase, campaignId, message);
    return { processed: 0, sent: 0, failed: 0, remaining: 0, status: "failed" };
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_whatsapp_campaign_recipients",
    { p_campaign_id: campaignId, p_limit: CAMPAIGN_BATCH_SIZE },
  );
  if (claimError) throw new Error(claimError.message);

  const batch = (claimed ?? []) as WhatsAppCampaignRecipient[];
  let sent = 0;
  let failed = 0;

  for (const recipient of batch) {
    try {
      const result = (await sendTwilioWhatsAppTemplate({
        to: recipient.phone_key,
        contentSid: campaign.content_sid,
        variables: recipient.variables,
        credentials,
      })) as { sid?: string };

      const conversationId = await ensureConversation({ supabase, campaign, recipient });
      if (conversationId) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content:
            renderTemplateBody(campaign.template_body, recipient.variables) ||
            `Campaign template sent (${campaign.content_sid})`,
          whatsapp_msg_id: result?.sid ?? null,
        });
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }

      await supabase
        .from("whatsapp_campaign_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          external_message_id: result?.sid ?? null,
          conversation_id: conversationId,
          error: null,
        })
        .eq("id", recipient.id);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      await supabase
        .from("whatsapp_campaign_recipients")
        .update({ status: "failed", error: message })
        .eq("id", recipient.id);
      failed += 1;
    }

    await delay(CAMPAIGN_SEND_INTERVAL_MS);
  }

  const remaining = await countPending(supabase, campaignId);
  await refreshCampaignCounters(supabase, campaignId);

  // A batch where everything failed and nothing has ever succeeded means the
  // configuration is wrong, not the recipients. Stop instead of burning the list.
  if (batch.length > 0 && sent === 0 && failed === batch.length) {
    const { count: everSent } = await supabase
      .from("whatsapp_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "sent");
    if (!everSent) {
      await failCampaign(
        supabase,
        campaignId,
        "Every message in the first batch failed. Check the template and Twilio sender.",
      );
      return { processed: batch.length, sent, failed, remaining, status: "failed" };
    }
  }

  if (remaining === 0) {
    await supabase
      .from("whatsapp_campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", campaignId)
      .in("status", ["queued", "sending"]);
    return { processed: batch.length, sent, failed, remaining, status: "completed" };
  }

  const { data: current } = await supabase
    .from("whatsapp_campaigns")
    .select("status")
    .eq("id", campaignId)
    .single();

  return {
    processed: batch.length,
    sent,
    failed,
    remaining,
    status: (current?.status as WhatsAppCampaign["status"]) ?? "sending",
  };
}

/** Rolls the recipient breakdown up onto the campaign row for the list view. */
async function refreshCampaignCounters(supabase: AdminClient, campaignId: string) {
  const countFor = async (status: string) => {
    const { count } = await supabase
      .from("whatsapp_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", status);
    return count ?? 0;
  };

  const [sent, failed, skipped] = await Promise.all([
    countFor("sent"),
    countFor("failed"),
    countFor("skipped"),
  ]);

  await supabase
    .from("whatsapp_campaigns")
    .update({ sent_count: sent, failed_count: failed, skipped_count: skipped })
    .eq("id", campaignId);
}

async function countPending(supabase: AdminClient, campaignId: string) {
  const { count } = await supabase
    .from("whatsapp_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");
  return count ?? 0;
}

async function failCampaign(supabase: AdminClient, campaignId: string, message: string) {
  await supabase
    .from("whatsapp_campaigns")
    .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
    .eq("id", campaignId);
}

/** Returns recipients claimed as "sending" by a worker that died, back to pending. */
export async function requeueStalledRecipients(campaignId: string, olderThanMinutes = 10) {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  await supabase
    .from("whatsapp_campaign_recipients")
    .update({ status: "pending" })
    .eq("campaign_id", campaignId)
    .eq("status", "sending")
    .lt("updated_at", cutoff);
}

export function describeAudience(snapshot: CampaignAudienceSnapshot) {
  if (snapshot.description) return snapshot.description;
  return snapshot.source === "conversations" ? "Selected conversations" : "Selected leads";
}
