import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";
import { evaluateLeadTransition, shouldClearPendingFollowUps } from "@/lib/lead-pipeline";
import { COUNSELLING_STATUSES } from "@/lib/types";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function parseStatus(value: string): LeadStatus | null {
  const normalized = value.trim().toLowerCase().replace(/[^a-z_]/g, "_");
  const known = Object.keys(LEAD_STATUS_LABELS);
  return known.includes(normalized) ? (normalized as LeadStatus) : null;
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();

  const supabase = await createClient();
  const state = request.nextUrl.searchParams.get("state");
  const conversationId = request.nextUrl.searchParams.get("conversation_id");
  const leadId = request.nextUrl.searchParams.get("lead_id");
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
    : 50;

  let query = supabase
    .from("ai_status_change_requests")
    .select(
      "id, agent_id, conversation_id, lead_id, current_status, proposed_status, rationale, evidence, state, requested_by, requested_at, reviewed_by, reviewed_at, review_reason, metadata, created_at, updated_at, lead:leads(id,full_name,status), conversation:conversations(id,channel,provider,name,external_user_id), reviewer:profiles(id,full_name,email)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (state && ["pending", "approved", "rejected", "cancelled"].includes(state)) {
    query = query.eq("state", state);
  }
  if (conversationId) query = query.eq("conversation_id", conversationId);
  if (leadId) query = query.eq("lead_id", leadId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const body = (await request.json()) as {
    id?: unknown;
    action?: unknown;
    reason?: unknown;
  };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: requestRow, error: requestError } = await supabase
    .from("ai_status_change_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (requestError || !requestRow) {
    return NextResponse.json({ error: "Status request not found" }, { status: 404 });
  }
  if (requestRow.state !== "pending") {
    return NextResponse.json({ error: "Only pending requests can be reviewed" }, { status: 400 });
  }

  if (action === "reject") {
    const { error: rejectError } = await supabase
      .from("ai_status_change_requests")
      .update({
        state: "rejected",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_reason: reason || "Rejected by reviewer.",
      })
      .eq("id", id);
    if (rejectError) return NextResponse.json({ error: rejectError.message }, { status: 500 });

    if (requestRow.lead_id) {
      await supabase.from("lead_activities").insert({
        lead_id: requestRow.lead_id,
        user_id: profile.id,
        type: "status_change",
        title: `AI status proposal rejected: ${requestRow.proposed_status}`,
        description: reason || null,
        metadata: { ai_status_request_id: id, source: "ai_automation" },
      });
    }
    await supabase.from("ai_action_audit_logs").insert({
      agent_id: requestRow.agent_id,
      conversation_id: requestRow.conversation_id,
      lead_id: requestRow.lead_id,
      action_type: "status_change_rejected",
      action_status: "skipped",
      reason: reason || "Rejected by reviewer.",
      metadata: { ai_status_request_id: id, reviewer_id: profile.id },
      created_by: profile.id,
    });
    return NextResponse.json({ ok: true });
  }

  const nextStatus = parseStatus(requestRow.proposed_status as string);
  if (!nextStatus) {
    return NextResponse.json({ error: "Proposed status is invalid" }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id,status,assigned_counsellor,counselling_completed_at,registration_completed_at")
    .eq("id", requestRow.lead_id)
    .single();
  if (leadError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const { data: followUps } = await supabase
    .from("follow_ups")
    .select("status, sequence")
    .eq("lead_id", lead.id);
  const completedCounsellingFollowUps = (followUps ?? []).filter(
    (row) => row.status === "completed" && row.sequence != null,
  ).length;
  const hasEnteredCounselling =
    COUNSELLING_STATUSES.includes(lead.status as LeadStatus) ||
    (followUps ?? []).some((row) => row.sequence != null);
  const hasCompletedCounselling =
    (lead.status as LeadStatus) === "counselling_completed" ||
    Boolean(lead.counselling_completed_at);

  const evaluation = evaluateLeadTransition(nextStatus, {
    currentStatus: lead.status as LeadStatus,
    hasEnteredCounselling,
    hasCompletedCounselling,
    completedCounsellingFollowUps,
  });
  if (!evaluation.allowed) {
    await supabase
      .from("ai_status_change_requests")
      .update({
        state: "rejected",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_reason:
          reason || evaluation.reason || "Rejected because transition violates status flow rules.",
      })
      .eq("id", id);
    return NextResponse.json(
      { error: evaluation.reason || "Transition not allowed by status workflow rules." },
      { status: 400 },
    );
  }

  const leadUpdates: Record<string, unknown> = { status: nextStatus };
  if (
    nextStatus === "registration_unpaid" ||
    nextStatus === "registered_paid_reg_fee"
  ) {
    leadUpdates.registration_completed_at =
      lead.registration_completed_at ?? new Date().toISOString();
  }

  if (nextStatus === "counselling_in_progress" && !lead.assigned_counsellor) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("assigned_user_id")
      .eq("id", requestRow.conversation_id)
      .maybeSingle();
    if (conversation?.assigned_user_id) {
      leadUpdates.assigned_counsellor = conversation.assigned_user_id;
    }
  }

  const { data: updatedLead, error: updateError } = await supabase
    .from("leads")
    .update(leadUpdates)
    .eq("id", lead.id)
    .select("id,status,assigned_counsellor")
    .single();
  if (updateError || !updatedLead) {
    return NextResponse.json({ error: updateError?.message ?? "Failed to update lead" }, { status: 500 });
  }

  if (nextStatus === "counselling_in_progress" && (lead.status as LeadStatus) === "inquiry_received") {
    await supabase.rpc("start_counselling_follow_ups", {
      p_lead_id: lead.id,
      p_assigned_user_id: (updatedLead.assigned_counsellor as string | null) ?? null,
      p_first_at: new Date().toISOString(),
    });
  } else if (shouldClearPendingFollowUps(nextStatus)) {
    await supabase.rpc("clear_pending_follow_ups", { p_lead_id: lead.id });
  }

  await supabase
    .from("ai_status_change_requests")
    .update({
      state: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_reason: reason || null,
    })
    .eq("id", id);

  await supabase.from("lead_activities").insert({
    lead_id: lead.id,
    user_id: profile.id,
    type: "status_change",
    title: `Status changed to ${nextStatus}`,
    description: reason || "Approved from AI status proposal queue.",
    metadata: { ai_status_request_id: id, source: "ai_automation" },
  });

  await supabase.from("ai_action_audit_logs").insert({
    agent_id: requestRow.agent_id,
    conversation_id: requestRow.conversation_id,
    lead_id: requestRow.lead_id,
    action_type: "status_change_approved",
    action_status: "applied",
    reason: reason || "Approved by reviewer.",
    metadata: { ai_status_request_id: id, reviewer_id: profile.id, status: nextStatus },
    created_by: profile.id,
  });

  if (nextStatus === "counselling_in_progress" && (lead.status as LeadStatus) === "inquiry_received") {
    await supabase.from("user_audit_events").insert({
      user_id: profile.id,
      event_type: "counselling_started",
      lead_id: lead.id,
    });
  }
  if (nextStatus === "registration_unpaid" || nextStatus === "registered_paid_reg_fee") {
    await supabase.from("user_audit_events").insert({
      user_id: profile.id,
      event_type: "registration",
      lead_id: lead.id,
      metadata: { registration_status: nextStatus, source: "ai_approval" },
    });
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
