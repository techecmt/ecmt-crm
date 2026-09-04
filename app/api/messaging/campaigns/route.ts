import { NextRequest, NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import {
  CAMPAIGN_MAX_RECIPIENTS,
  candidatesFromConversations,
  candidatesFromLeads,
  candidatesFromManualEntries,
  materialiseCampaignRecipients,
} from "@/lib/messaging/campaigns";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  validateVariableBinding,
  type CampaignAudienceSource,
  type CampaignVariableMapping,
  type ManualRecipientEntry,
} from "@/lib/campaigns";
import { canonicalizePhoneKey } from "@/lib/phone";
import { isAdminRole } from "@/lib/types";

async function requireCampaignAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminRole(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { profile };
}

export async function GET() {
  const auth = await requireCampaignAdmin();
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

type CreateCampaignBody = {
  name?: unknown;
  twilioConnectionId?: unknown;
  contentSid?: unknown;
  templateName?: unknown;
  templateLanguage?: unknown;
  templateBody?: unknown;
  variableMapping?: unknown;
  audience?: {
    source?: unknown;
    leadIds?: unknown;
    conversationIds?: unknown;
    manualEntries?: unknown;
    description?: unknown;
    filters?: unknown;
  };
  sendCap?: unknown;
  skipRecentDays?: unknown;
  costPerMessage?: unknown;
  currency?: unknown;
};

function asIdList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && item.trim() !== ""),
    ),
  ];
}

function asVariableMapping(value: unknown): CampaignVariableMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const mapping: CampaignVariableMapping = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const binding = raw as { source?: unknown; value?: unknown };
    if (
      binding.source !== "lead_field" &&
      binding.source !== "static" &&
      binding.source !== "link"
    ) {
      continue;
    }
    if (typeof binding.value !== "string") continue;
    mapping[key] = { source: binding.source, value: binding.value };
  }
  return mapping;
}

/** Deduplicated, canonicalised numbers typed straight into the builder. */
function asManualEntries(value: unknown): ManualRecipientEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ManualRecipientEntry[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { phone?: unknown; name?: unknown };
    if (typeof record.phone !== "string") continue;
    const phoneKey = canonicalizePhoneKey(record.phone);
    if (!phoneKey || seen.has(phoneKey)) continue;
    seen.add(phoneKey);
    entries.push({
      phone: phoneKey,
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : null,
    });
  }
  return entries;
}

function asPositiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export async function POST(request: NextRequest) {
  const auth = await requireCampaignAdmin();
  if (auth.error) return auth.error;

  const body = (await request.json()) as CreateCampaignBody;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const twilioConnectionId =
    typeof body.twilioConnectionId === "string" ? body.twilioConnectionId : "";
  const contentSid = typeof body.contentSid === "string" ? body.contentSid.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
  }
  if (!twilioConnectionId) {
    return NextResponse.json({ error: "A Twilio connection is required" }, { status: 400 });
  }
  if (!/^HX[a-fA-F0-9]{32}$/.test(contentSid)) {
    return NextResponse.json({ error: "A valid template Content SID is required" }, { status: 400 });
  }

  const requestedSource = body.audience?.source;
  const source: CampaignAudienceSource =
    requestedSource === "conversations" || requestedSource === "manual"
      ? requestedSource
      : "leads";
  const leadIds = asIdList(body.audience?.leadIds);
  const conversationIds = asIdList(body.audience?.conversationIds);
  const manualEntries = asManualEntries(body.audience?.manualEntries);
  const requested =
    source === "leads"
      ? leadIds.length
      : source === "conversations"
        ? conversationIds.length
        : manualEntries.length;

  if (requested === 0) {
    return NextResponse.json({ error: "Select at least one recipient" }, { status: 400 });
  }
  if (requested > CAMPAIGN_MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `A campaign can target at most ${CAMPAIGN_MAX_RECIPIENTS} recipients` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("twilio_connections")
    .select("id, is_active")
    .eq("id", twilioConnectionId)
    .maybeSingle();
  if (!connection) {
    return NextResponse.json({ error: "Twilio connection not found" }, { status: 404 });
  }
  if (!connection.is_active) {
    return NextResponse.json({ error: "Twilio connection is inactive" }, { status: 400 });
  }

  const mapping = asVariableMapping(body.variableMapping);
  for (const [key, binding] of Object.entries(mapping)) {
    const problem = validateVariableBinding(binding);
    if (problem) {
      return NextResponse.json(
        { error: `Variable {{${key}}}: ${problem.toLowerCase()}` },
        { status: 400 },
      );
    }
  }

  const sendCap = asPositiveInt(body.sendCap);
  const skipRecentDays = asPositiveInt(body.skipRecentDays);
  const costPerMessage = Number(body.costPerMessage);

  const { data: campaign, error: insertError } = await admin
    .from("whatsapp_campaigns")
    .insert({
      name,
      twilio_connection_id: twilioConnectionId,
      content_sid: contentSid,
      template_name: typeof body.templateName === "string" ? body.templateName : "",
      template_language:
        typeof body.templateLanguage === "string" && body.templateLanguage.trim()
          ? body.templateLanguage.trim()
          : "en",
      template_body: typeof body.templateBody === "string" ? body.templateBody : null,
      variable_mapping: mapping,
      audience: {
        source,
        description:
          typeof body.audience?.description === "string" ? body.audience.description : undefined,
        requested,
        filters:
          body.audience?.filters && typeof body.audience.filters === "object"
            ? (body.audience.filters as Record<string, unknown>)
            : undefined,
      },
      status: "draft",
      send_cap: sendCap,
      skip_recent_days: skipRecentDays,
      cost_per_message: Number.isFinite(costPerMessage) && costPerMessage > 0 ? costPerMessage : 0,
      currency: typeof body.currency === "string" && body.currency.trim() ? body.currency.trim() : "USD",
      created_by: auth.profile.id,
    })
    .select("*")
    .single();

  if (insertError || !campaign) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create campaign" },
      { status: 500 },
    );
  }

  try {
    const candidates =
      source === "leads"
        ? await candidatesFromLeads(admin, leadIds)
        : source === "conversations"
          ? await candidatesFromConversations(admin, conversationIds)
          : await candidatesFromManualEntries(admin, manualEntries);

    const summary = await materialiseCampaignRecipients({
      supabase: admin,
      campaignId: campaign.id as string,
      candidates,
      mapping,
      sendCap,
      skipRecentDays,
    });

    await admin
      .from("whatsapp_campaigns")
      .update({ total_recipients: summary.queued })
      .eq("id", campaign.id);

    return NextResponse.json({
      campaign: { ...campaign, total_recipients: summary.queued },
      summary,
    });
  } catch (error) {
    // A campaign with a half-built recipient list is worse than none at all.
    await admin.from("whatsapp_campaigns").delete().eq("id", campaign.id);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build the recipient list",
      },
      { status: 500 },
    );
  }
}
