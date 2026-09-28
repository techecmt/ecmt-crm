import "server-only";

import { formatSgtTime24, getSgtDateKey } from "@/lib/timezone";
import { COUNSELLING_STATUSES, LEAD_STATUS_LABELS } from "@/lib/types";
import { evaluateLeadTransition } from "@/lib/lead-pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AgentAutomationSettings,
  CrmActionDecision,
  FollowUpDecision,
  LeadAutomationSnapshot,
  LeadFieldDecision,
} from "./ai-crm-actions";

type AdminClient = ReturnType<typeof createAdminClient>;

type ConversationAutomationContext = {
  id: string;
  channel: "whatsapp" | "messenger" | "website";
  provider: "meta" | "twilio" | null;
  assigned_user_id: string | null;
  lead_id: string | null;
  ai_agent_id: string | null;
  mode: "agent" | "human";
};

export type ApplyAiActionsInput = {
  supabase?: AdminClient;
  agentSettings: AgentAutomationSettings;
  conversation: ConversationAutomationContext;
  lead: LeadAutomationSnapshot | null;
  decision: CrmActionDecision;
};

export type ApplyAiActionsResult = {
  leadUpdatesApplied: Record<string, string>;
  fieldConflicts: Array<{ field: string; currentValue: string | null; proposedValue: string }>;
  followUpId: string | null;
  statusRequestId: string | null;
  outboundMessage: string | null;
  shouldEscalate: boolean;
};

function asJson(value: unknown) {
  return value === undefined ? null : value;
}

async function writeAuditLog(
  supabase: AdminClient,
  input: {
    agentId: string | null;
    conversationId: string;
    leadId: string | null;
    actionType: string;
    actionStatus: "applied" | "skipped" | "queued" | "failed";
    fieldName?: string;
    previousValue?: unknown;
    nextValue?: unknown;
    reason?: string | null;
    confidence?: number | null;
    evidence?: unknown;
    metadata?: unknown;
  },
) {
  await supabase.from("ai_action_audit_logs").insert({
    agent_id: input.agentId,
    conversation_id: input.conversationId,
    lead_id: input.leadId,
    action_type: input.actionType,
    action_status: input.actionStatus,
    field_name: input.fieldName ?? null,
    previous_value: asJson(input.previousValue),
    next_value: asJson(input.nextValue),
    reason: input.reason ?? null,
    confidence: input.confidence ?? null,
    evidence: asJson(input.evidence ?? {}),
    metadata: asJson(input.metadata ?? {}),
  });
}

function toFollowUpSchedule(dueAt: string | null) {
  const date = dueAt ? new Date(dueAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      scheduledAt: fallback.toISOString(),
      dueDate: getSgtDateKey(fallback),
      dueTime: formatSgtTime24(fallback),
    };
  }
  return {
    scheduledAt: date.toISOString(),
    dueDate: getSgtDateKey(date),
    dueTime: formatSgtTime24(date),
  };
}

async function applyLeadFieldUpdates(input: {
  supabase: AdminClient;
  agentId: string | null;
  conversation: ConversationAutomationContext;
  lead: LeadAutomationSnapshot;
  decisions: LeadFieldDecision[];
}) {
  const leadPatch: Record<string, string> = {};
  const conflicts: Array<{ field: string; currentValue: string | null; proposedValue: string }> = [];
  const appliedFields: string[] = [];

  for (const decision of input.decisions) {
    const current = (input.lead[decision.field] ?? null) as string | null;
    if (decision.action === "apply") {
      leadPatch[decision.field] = decision.proposedValue;
      appliedFields.push(decision.field);
      await writeAuditLog(input.supabase, {
        agentId: input.agentId,
        conversationId: input.conversation.id,
        leadId: input.lead.id,
        actionType: "lead_field_update",
        actionStatus: "applied",
        fieldName: decision.field,
        previousValue: current,
        nextValue: decision.proposedValue,
        reason: "Applied by AI CRM policy.",
        confidence: decision.confidence,
        evidence: { source: decision.source, evidence: decision.evidence },
      });
      continue;
    }

    if (decision.action === "conflict") {
      conflicts.push({
        field: decision.field,
        currentValue: current,
        proposedValue: decision.proposedValue,
      });
    }

    await writeAuditLog(input.supabase, {
      agentId: input.agentId,
      conversationId: input.conversation.id,
      leadId: input.lead.id,
      actionType: decision.action === "conflict" ? "lead_field_conflict" : "lead_field_skip",
      actionStatus: "skipped",
      fieldName: decision.field,
      previousValue: current,
      nextValue: decision.proposedValue,
      reason: decision.reason,
      confidence: decision.confidence,
      evidence: { source: decision.source, evidence: decision.evidence },
    });
  }

  if (Object.keys(leadPatch).length > 0) {
    await input.supabase.from("leads").update(leadPatch).eq("id", input.lead.id);
    await input.supabase.from("lead_activities").insert({
      lead_id: input.lead.id,
      type: "system",
      title: "AI updated CRM fields",
      description: `Fields updated: ${appliedFields.join(", ")}`,
      metadata: {
        source: "ai_automation",
        fields: appliedFields,
        conversation_id: input.conversation.id,
      },
    });
    await input.supabase.from("user_audit_events").insert({
      user_id: null,
      event_type: "crm_entry",
      lead_id: input.lead.id,
      metadata: {
        source: "ai_automation",
        fields: appliedFields,
        conversation_id: input.conversation.id,
      },
    });
  }

  if (conflicts.length > 0) {
    await input.supabase.from("lead_activities").insert({
      lead_id: input.lead.id,
      type: "system",
      title: "AI detected CRM field conflicts",
      description: "Existing values were preserved. Review suggested changes in AI audit logs.",
      metadata: {
        source: "ai_automation",
        conflicts,
        conversation_id: input.conversation.id,
      },
    });
  }

  return { leadPatch, conflicts };
}

async function queueStatusChange(input: {
  supabase: AdminClient;
  agentId: string | null;
  conversation: ConversationAutomationContext;
  lead: LeadAutomationSnapshot;
  decision: NonNullable<CrmActionDecision["statusDecision"]>;
}) {
  if (input.decision.action !== "queue") {
    await writeAuditLog(input.supabase, {
      agentId: input.agentId,
      conversationId: input.conversation.id,
      leadId: input.lead.id,
      actionType: "status_change_skip",
      actionStatus: "skipped",
      reason: input.decision.skipReason ?? "Status action skipped by policy.",
      confidence: input.decision.confidence,
      evidence: { evidence: input.decision.evidence },
      metadata: { status: input.decision.status },
    });
    return null;
  }

  if (input.decision.status === input.lead.status) {
    await writeAuditLog(input.supabase, {
      agentId: input.agentId,
      conversationId: input.conversation.id,
      leadId: input.lead.id,
      actionType: "status_change_skip",
      actionStatus: "skipped",
      reason: "Proposed status matches current status.",
      confidence: input.decision.confidence,
      evidence: { evidence: input.decision.evidence },
      metadata: { status: input.decision.status },
    });
    return null;
  }

  const { data: followUpRows } = await input.supabase
    .from("follow_ups")
    .select("status, sequence")
    .eq("lead_id", input.lead.id);

  const completedCounsellingFollowUps = (followUpRows ?? []).filter(
    (row) => row.status === "completed" && row.sequence != null,
  ).length;
  const hasEnteredCounselling =
    COUNSELLING_STATUSES.includes(input.lead.status) ||
    (followUpRows ?? []).some((row) => row.sequence != null);
  const hasCompletedCounselling = input.lead.status === "counselling_completed";

  const transition = evaluateLeadTransition(input.decision.status, {
    currentStatus: input.lead.status,
    hasEnteredCounselling,
    hasCompletedCounselling,
    completedCounsellingFollowUps,
  });

  if (!transition.allowed) {
    await writeAuditLog(input.supabase, {
      agentId: input.agentId,
      conversationId: input.conversation.id,
      leadId: input.lead.id,
      actionType: "status_change_skip",
      actionStatus: "skipped",
      reason: transition.reason ?? "Status transition blocked by pipeline rule.",
      confidence: input.decision.confidence,
      evidence: { evidence: input.decision.evidence },
      metadata: { status: input.decision.status },
    });
    return null;
  }

  const { data: existing } = await input.supabase
    .from("ai_status_change_requests")
    .select("id")
    .eq("conversation_id", input.conversation.id)
    .eq("lead_id", input.lead.id)
    .eq("proposed_status", input.decision.status)
    .eq("state", "pending")
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await input.supabase
    .from("ai_status_change_requests")
    .insert({
      agent_id: input.agentId,
      conversation_id: input.conversation.id,
      lead_id: input.lead.id,
      current_status: input.lead.status,
      proposed_status: input.decision.status,
      rationale: input.decision.reason ?? "",
      evidence: {
        text: input.decision.evidence ?? null,
        confidence: input.decision.confidence,
      },
      metadata: {
        source: "ai_automation",
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    await writeAuditLog(input.supabase, {
      agentId: input.agentId,
      conversationId: input.conversation.id,
      leadId: input.lead.id,
      actionType: "status_change_queue_failed",
      actionStatus: "failed",
      reason: error?.message ?? "Failed to queue status request.",
      confidence: input.decision.confidence,
      evidence: { evidence: input.decision.evidence },
      metadata: { status: input.decision.status },
    });
    return null;
  }

  await input.supabase.from("lead_activities").insert({
    lead_id: input.lead.id,
    type: "status_change",
    title: `AI proposed status: ${LEAD_STATUS_LABELS[input.decision.status] ?? input.decision.status}`,
    description: input.decision.reason ?? null,
    metadata: {
      source: "ai_automation",
      request_id: data.id,
      proposed_status: input.decision.status,
      confidence: input.decision.confidence,
    },
  });

  await writeAuditLog(input.supabase, {
    agentId: input.agentId,
    conversationId: input.conversation.id,
    leadId: input.lead.id,
    actionType: "status_change_queued",
    actionStatus: "queued",
    reason: input.decision.reason,
    confidence: input.decision.confidence,
    evidence: { evidence: input.decision.evidence },
    metadata: { request_id: data.id, status: input.decision.status },
  });

  return data.id as string;
}

async function applyFollowUpAction(input: {
  supabase: AdminClient;
  agentId: string | null;
  conversation: ConversationAutomationContext;
  lead: LeadAutomationSnapshot;
  decision: FollowUpDecision;
}) {
  if (!input.decision || input.decision.action !== "create_or_reschedule") {
    if (input.decision?.action === "skip") {
      await writeAuditLog(input.supabase, {
        agentId: input.agentId,
        conversationId: input.conversation.id,
        leadId: input.lead.id,
        actionType: "follow_up_skip",
        actionStatus: "skipped",
        reason: input.decision.skipReason ?? "Follow-up action skipped by policy.",
        confidence: input.decision.confidence,
        evidence: { evidence: input.decision.evidence },
      });
    }
    return null;
  }

  const ownerId = input.conversation.assigned_user_id || input.lead.assigned_counsellor || null;
  const schedule = toFollowUpSchedule(input.decision.dueAt);
  const commonPayload = {
    lead_id: input.lead.id,
    assigned_user_id: ownerId,
    assigned_to: ownerId,
    followup_type: input.decision.followUpType,
    type: input.decision.followUpType,
    due_date: schedule.dueDate,
    due_time: schedule.dueTime,
    scheduled_at: schedule.scheduledAt,
    priority: "normal",
    status: "pending",
    remarks: input.decision.reason ?? null,
    notes: input.decision.reason ?? null,
  };

  const { data: existing } = await input.supabase
    .from("follow_ups")
    .select("id")
    .eq("lead_id", input.lead.id)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let followUpId: string | null = null;
  if (existing?.id) {
    const { data } = await input.supabase
      .from("follow_ups")
      .update(commonPayload)
      .eq("id", existing.id)
      .select("id")
      .single();
    followUpId = (data?.id as string | undefined) ?? existing.id;
    await writeAuditLog(input.supabase, {
      agentId: input.agentId,
      conversationId: input.conversation.id,
      leadId: input.lead.id,
      actionType: "follow_up_rescheduled",
      actionStatus: "applied",
      reason: input.decision.reason,
      confidence: input.decision.confidence,
      evidence: { evidence: input.decision.evidence },
      metadata: { follow_up_id: followUpId, owner_id: ownerId },
    });
  } else {
    const { data } = await input.supabase
      .from("follow_ups")
      .insert({
        ...commonPayload,
        created_by: null,
      })
      .select("id")
      .single();
    followUpId = (data?.id as string | undefined) ?? null;
    await writeAuditLog(input.supabase, {
      agentId: input.agentId,
      conversationId: input.conversation.id,
      leadId: input.lead.id,
      actionType: "follow_up_created",
      actionStatus: "applied",
      reason: input.decision.reason,
      confidence: input.decision.confidence,
      evidence: { evidence: input.decision.evidence },
      metadata: { follow_up_id: followUpId, owner_id: ownerId },
    });
  }

  await input.supabase.from("lead_activities").insert({
    lead_id: input.lead.id,
    type: "follow_up",
    title: existing?.id ? "AI rescheduled follow-up" : "AI scheduled follow-up",
    description: input.decision.reason ?? null,
    metadata: {
      source: "ai_automation",
      follow_up_id: followUpId,
      owner_id: ownerId,
      due_date: schedule.dueDate,
      due_time: schedule.dueTime,
    },
  });

  return followUpId;
}

export async function applyAiCrmActions(input: ApplyAiActionsInput): Promise<ApplyAiActionsResult> {
  const supabase = input.supabase ?? createAdminClient();
  const lead = input.lead;

  if (!lead || !input.conversation.lead_id) {
    await writeAuditLog(supabase, {
      agentId: input.agentSettings.id,
      conversationId: input.conversation.id,
      leadId: input.conversation.lead_id ?? null,
      actionType: "crm_automation_skip",
      actionStatus: "skipped",
      reason: "No linked lead found for CRM automation actions.",
    });
    return {
      leadUpdatesApplied: {},
      fieldConflicts: [],
      followUpId: null,
      statusRequestId: null,
      outboundMessage: null,
      shouldEscalate: input.decision.escalationRequested,
    };
  }

  const { leadPatch, conflicts } = await applyLeadFieldUpdates({
    supabase,
    agentId: input.agentSettings.id,
    conversation: input.conversation,
    lead,
    decisions: input.decision.fieldDecisions,
  });

  const statusRequestId = input.decision.statusDecision
    ? await queueStatusChange({
        supabase,
        agentId: input.agentSettings.id,
        conversation: input.conversation,
        lead: {
          ...lead,
          ...(leadPatch as Partial<LeadAutomationSnapshot>),
        },
        decision: input.decision.statusDecision,
      })
    : null;

  const followUpId = input.decision.followUpDecision
    ? await applyFollowUpAction({
        supabase,
        agentId: input.agentSettings.id,
        conversation: input.conversation,
        lead,
        decision: input.decision.followUpDecision,
      })
    : null;

  const outboundMessage =
    input.decision.followUpDecision?.outboundMessage &&
    input.agentSettings.outbound_whatsapp_enabled &&
    input.agentSettings.outbound_policy !== "disabled" &&
    input.conversation.mode !== "human"
      ? input.decision.followUpDecision.outboundMessage
      : null;

  if (outboundMessage) {
    await writeAuditLog(supabase, {
      agentId: input.agentSettings.id,
      conversationId: input.conversation.id,
      leadId: lead.id,
      actionType: "outbound_message_suggested",
      actionStatus: "queued",
      reason: "Prepared outbound follow-up acknowledgment message.",
      metadata: { message: outboundMessage },
    });
  }

  return {
    leadUpdatesApplied: leadPatch,
    fieldConflicts: conflicts,
    followUpId,
    statusRequestId,
    outboundMessage,
    shouldEscalate: input.decision.escalationRequested,
  };
}
