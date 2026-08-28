import { NextRequest, NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { EMPTY_CAMPAIGN_COUNTS, type CampaignRecipientStatus } from "@/lib/campaigns";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/types";

const RECIPIENT_STATUSES: CampaignRecipientStatus[] = [
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
];

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

async function loadCounts(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
) {
  const counts = { ...EMPTY_CAMPAIGN_COUNTS };
  await Promise.all(
    RECIPIENT_STATUSES.map(async (status) => {
      const { count } = await admin
        .from("whatsapp_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", status);
      counts[status] = count ?? 0;
    }),
  );
  return counts;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCampaignAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: campaign, error } = await admin
    .from("whatsapp_campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const statusFilter = request.nextUrl.searchParams.get("status");
  let recipientQuery = admin
    .from("whatsapp_campaign_recipients")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .limit(500);
  if (statusFilter && RECIPIENT_STATUSES.includes(statusFilter as CampaignRecipientStatus)) {
    recipientQuery = recipientQuery.eq("status", statusFilter);
  }

  const [{ data: recipients }, counts] = await Promise.all([
    recipientQuery,
    loadCounts(admin, id),
  ]);

  return NextResponse.json({ campaign, recipients: recipients ?? [], counts });
}

/** Pause, resume, or cancel a campaign. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCampaignAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as { action?: unknown };
  const action = body.action;
  if (action !== "pause" && action !== "cancel" && action !== "resume") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("whatsapp_campaigns")
    .select("status")
    .eq("id", id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const status = campaign.status as string;

  if (action === "pause") {
    if (status !== "sending" && status !== "queued") {
      return NextResponse.json({ error: "Only a running campaign can be paused" }, { status: 400 });
    }
    await admin.from("whatsapp_campaigns").update({ status: "paused" }).eq("id", id);
  }

  if (action === "cancel") {
    if (status === "completed" || status === "cancelled") {
      return NextResponse.json({ error: "Campaign already finished" }, { status: 400 });
    }
    await admin
      .from("whatsapp_campaigns")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", id);
    // Unsent recipients are recorded as skipped so the report stays accurate.
    await admin
      .from("whatsapp_campaign_recipients")
      .update({ status: "skipped", skip_reason: "campaign_cancelled" })
      .eq("campaign_id", id)
      .in("status", ["pending", "sending"]);
  }

  if (action === "resume") {
    if (status !== "paused") {
      return NextResponse.json({ error: "Only a paused campaign can be resumed" }, { status: 400 });
    }
    await admin.from("whatsapp_campaigns").update({ status: "queued", error: null }).eq("id", id);
  }

  const { data: updated } = await admin
    .from("whatsapp_campaigns")
    .select("*")
    .eq("id", id)
    .single();
  return NextResponse.json({ campaign: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCampaignAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: campaign } = await admin
    .from("whatsapp_campaigns")
    .select("status")
    .eq("id", id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status === "sending" || campaign.status === "queued") {
    return NextResponse.json(
      { error: "Cancel the campaign before deleting it" },
      { status: 400 },
    );
  }

  const { error } = await admin.from("whatsapp_campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
