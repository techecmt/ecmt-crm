import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { resolveBaseUrl, triggerCampaignWorker } from "@/lib/messaging/campaign-worker";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/types";

/** Moves a draft (or paused) campaign into the send queue and kicks the worker. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: campaign } = await admin
    .from("whatsapp_campaigns")
    .select("id, status, total_recipients")
    .eq("id", id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (campaign.status !== "draft" && campaign.status !== "paused") {
    return NextResponse.json(
      { error: `A ${campaign.status} campaign cannot be started` },
      { status: 400 },
    );
  }

  const { count: pending } = await admin
    .from("whatsapp_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("status", "pending");

  if (!pending) {
    return NextResponse.json(
      { error: "This campaign has no recipients left to send to" },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("whatsapp_campaigns")
    .update({
      status: "queued",
      error: null,
      started_at: new Date().toISOString(),
      completed_at: null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = resolveBaseUrl(request);
  if (process.env.NODE_ENV === "production") {
    after(() => triggerCampaignWorker(baseUrl, id));
  } else {
    // In local/dev, rely on an immediate trigger since `after()` can be unreliable.
    void triggerCampaignWorker(baseUrl, id);
  }

  return NextResponse.json({ ok: true, queued: pending });
}
