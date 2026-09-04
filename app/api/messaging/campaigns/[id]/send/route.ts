import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { resolveBaseUrl, triggerCampaignWorker } from "@/lib/messaging/campaign-worker";
import { fetchTwilioContentTemplate } from "@/lib/messaging/twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/types";

/**
 * WhatsApp refuses templates that are not approved yet, and a campaign would
 * otherwise mark every recipient failed. Checked here rather than at build time
 * so a campaign drafted against a pending template can simply be sent later.
 *
 * Best effort: if Twilio itself is unreachable we let the send proceed rather
 * than blocking on our own health check.
 */
async function templateApprovalProblem(
  admin: ReturnType<typeof createAdminClient>,
  campaign: { content_sid: string; twilio_connection_id: string },
) {
  const { data: connection } = await admin
    .from("twilio_connections")
    .select("account_sid, auth_token, whatsapp_from, messaging_service_sid")
    .eq("id", campaign.twilio_connection_id)
    .maybeSingle();
  if (!connection) return "The Twilio connection for this campaign no longer exists";

  try {
    const template = await fetchTwilioContentTemplate(campaign.content_sid, connection);
    if (!template) return null;
    if (template.approvalStatus === "approved") return null;
    if (template.approvalStatus === "rejected") {
      return `WhatsApp rejected this template${
        template.rejectionReason ? `: ${template.rejectionReason}` : ""
      }. Create a new version before sending.`;
    }
    return `This template is not approved by WhatsApp yet (${template.approvalStatus}). Sending would fail for every recipient.`;
  } catch (error) {
    console.error("[Campaign] Template approval check failed:", error);
    return null;
  }
}

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
    .select("id, status, total_recipients, content_sid, twilio_connection_id")
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

  const approvalProblem = await templateApprovalProblem(admin, campaign);
  if (approvalProblem) {
    return NextResponse.json({ error: approvalProblem }, { status: 400 });
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
