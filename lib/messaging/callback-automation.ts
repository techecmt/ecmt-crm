import "server-only";

import { formatSgtDateTime, sgtDateTimeToUtcIso } from "@/lib/timezone";
import type { LeadStatus } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage } from "./send";
import {
  buildCallbackConfirmation,
  parseCallbackChoice,
  shouldTryCallbackParser,
  type CallbackSlot,
} from "./callback-parser";

type SupabaseClient = ReturnType<typeof createAdminClient>;

type CallbackConversation = {
  id: string;
  channel: "whatsapp" | "messenger" | "website";
  provider: "meta" | "twilio" | null;
  external_user_id: string;
  page_id: string | null;
  twilio_connection_id: string | null;
  ai_agent_id: string | null;
  assigned_user_id: string | null;
  lead_id: string | null;
  mode: "agent" | "human";
};

type CallbackLead = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  interested_course: string | null;
  assigned_counsellor: string | null;
  status: LeadStatus;
};

const OPEN_REQUEST_STATUSES = ["new", "contacted", "confirmed"];
const CALLBACK_TZ = "Asia/Singapore";

function sanitizeEmail(value: string | null | undefined, leadId: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return `unknown-${leadId.slice(0, 8)}@callback.local`;
  return trimmed.toLowerCase();
}

function sanitizeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed || fallback;
}

function callbackLabel(slot: CallbackSlot) {
  if (slot.preset === "today_evening") return "today evening";
  if (slot.preset === "tonight") return "tonight";
  if (slot.preset === "tomorrow") return "tomorrow";
  return formatSgtDateTime(sgtDateTimeToUtcIso(slot.dateKey, slot.timeKey) ?? new Date().toISOString());
}

async function ensureFollowUpTask(input: {
  supabase: SupabaseClient;
  lead: CallbackLead;
  conversation: CallbackConversation;
  slot: CallbackSlot;
  callbackRequestId: string;
}) {
  const scheduledAt =
    sgtDateTimeToUtcIso(input.slot.dateKey, input.slot.timeKey) ??
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const ownerId =
    input.conversation.assigned_user_id || input.lead.assigned_counsellor || null;

  const basePayload = {
    lead_id: input.lead.id,
    assigned_user_id: ownerId,
    assigned_to: ownerId,
    followup_type: "call",
    type: "call",
    due_date: input.slot.dateKey,
    due_time: input.slot.timeKey,
    scheduled_at: scheduledAt,
    priority: "normal",
    status: "pending",
    remarks: "Auto callback follow-up from WhatsApp preference.",
    notes: `Auto callback follow-up from WhatsApp preference. Request: ${input.callbackRequestId}`,
  };

  const { data: existing } = await input.supabase
    .from("follow_ups")
    .select("id")
    .eq("lead_id", input.lead.id)
    .eq("status", "pending")
    .ilike("notes", "Auto callback follow-up from WhatsApp preference.%")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await input.supabase.from("follow_ups").update(basePayload).eq("id", existing.id);
    return existing.id as string;
  }

  const { data } = await input.supabase
    .from("follow_ups")
    .insert({
      ...basePayload,
      created_by: null,
    })
    .select("id")
    .single();

  return (data?.id as string | undefined) ?? null;
}

async function createOrReuseCallbackRequest(input: {
  supabase: SupabaseClient;
  lead: CallbackLead;
  conversation: CallbackConversation;
  slot: CallbackSlot;
  userText: string;
}) {
  const preferredTime = `${input.slot.timeKey}:00`;

  const { data: existing } = await input.supabase
    .from("callback_requests")
    .select("id")
    .eq("lead_id", input.lead.id)
    .eq("request_type", "callback")
    .in("status", [...OPEN_REQUEST_STATUSES])
    .eq("preferred_date", input.slot.dateKey)
    .eq("preferred_time", preferredTime)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { callbackRequestId: existing.id as string, duplicate: true };
  }

  const metadataSlots =
    input.slot.capturedSlots.length > 0
      ? input.slot.capturedSlots.map((slot) => `${slot.dateKey} ${slot.timeKey}`).join(", ")
      : null;
  const noteParts = [
    "Created from deterministic WhatsApp callback parser.",
    `Source: ${input.slot.source}`,
    metadataSlots ? `Captured slots: ${metadataSlots}` : null,
    `Raw text: ${input.userText}`,
  ].filter(Boolean);

  const { data, error } = await input.supabase
    .from("callback_requests")
    .insert({
      lead_id: input.lead.id,
      full_name: sanitizeText(input.lead.full_name, "Unknown lead"),
      email: sanitizeEmail(input.lead.email, input.lead.id),
      phone: sanitizeText(input.lead.phone, input.conversation.external_user_id),
      course: sanitizeText(input.lead.interested_course, "General enquiry"),
      preferred_date: input.slot.dateKey,
      preferred_time: input.slot.timeKey,
      preferred_timezone: CALLBACK_TZ,
      status: "new",
      request_type: "callback",
      assigned_counsellor:
        input.lead.assigned_counsellor || input.conversation.assigned_user_id || null,
      notes: noteParts.join(" "),
      source_url: `whatsapp://conversation/${input.conversation.id}`,
      utm: {
        source: "whatsapp_callback_parser",
        conversation_id: input.conversation.id,
        agent_id: input.conversation.ai_agent_id,
      },
      conversation_id: input.conversation.id,
      agent_id: input.conversation.ai_agent_id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message || "Failed to create callback request");
  return { callbackRequestId: data.id as string, duplicate: false };
}

async function sendAssistantMessage(input: {
  supabase: SupabaseClient;
  conversation: CallbackConversation;
  text: string;
}) {
  await sendMessage(
    {
      channel: input.conversation.channel,
      provider: input.conversation.provider,
      external_user_id: input.conversation.external_user_id,
      page_id: input.conversation.page_id,
      twilio_connection_id: input.conversation.twilio_connection_id ?? null,
    },
    input.text,
  );
  await input.supabase.from("messages").insert({
    conversation_id: input.conversation.id,
    role: "assistant",
    content: input.text,
  });
}

export async function tryHandleDeterministicCallbackReply(input: {
  supabase: SupabaseClient;
  conversation: CallbackConversation;
  userText: string;
}): Promise<boolean> {
  if (input.conversation.channel !== "whatsapp") return false;
  if (!input.userText.trim()) return false;

  const { data: assistantMessages } = await input.supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", input.conversation.id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(4);
  const recentAssistant = (assistantMessages ?? [])
    .map((message) => (message.content as string | null) ?? "")
    .filter(Boolean);

  if (
    !shouldTryCallbackParser({
      userText: input.userText,
      lastAssistantMessages: recentAssistant,
    })
  ) {
    return false;
  }

  const parsed = parseCallbackChoice({ userText: input.userText, now: new Date() });
  if (parsed.kind === "none") return false;

  if (parsed.kind === "ambiguous" || parsed.kind === "invalid") {
    await sendAssistantMessage({
      supabase: input.supabase,
      conversation: input.conversation,
      text: parsed.prompt,
    });
    return true;
  }

  if (!input.conversation.lead_id) {
    return false;
  }

  const { data: lead } = await input.supabase
    .from("leads")
    .select("id, full_name, email, phone, interested_course, assigned_counsellor, status")
    .eq("id", input.conversation.lead_id)
    .maybeSingle();
  if (!lead) return false;

  const leadSnapshot: CallbackLead = {
    id: lead.id as string,
    full_name: (lead.full_name as string | null) ?? null,
    email: (lead.email as string | null) ?? null,
    phone: (lead.phone as string | null) ?? null,
    interested_course: (lead.interested_course as string | null) ?? null,
    assigned_counsellor: (lead.assigned_counsellor as string | null) ?? null,
    status: (lead.status as LeadStatus) ?? "inquiry_received",
  };

  const requestResult = await createOrReuseCallbackRequest({
    supabase: input.supabase,
    lead: leadSnapshot,
    conversation: input.conversation,
    slot: parsed.slot,
    userText: input.userText,
  });

  if (!requestResult.duplicate) {
    await ensureFollowUpTask({
      supabase: input.supabase,
      lead: leadSnapshot,
      conversation: input.conversation,
      slot: parsed.slot,
      callbackRequestId: requestResult.callbackRequestId,
    });

    await input.supabase.from("lead_activities").insert({
      lead_id: leadSnapshot.id,
      type: "system",
      title: "Callback slot captured from WhatsApp",
      description: `Preferred callback slot: ${parsed.slot.dateKey} ${parsed.slot.timeKey}.`,
      metadata: {
        source: "whatsapp_callback_parser",
        callback_request_id: requestResult.callbackRequestId,
        conversation_id: input.conversation.id,
        agent_id: input.conversation.ai_agent_id,
      },
    });
  }

  const confirmation = buildCallbackConfirmation({
    label: callbackLabel(parsed.slot),
    duplicate: requestResult.duplicate,
  });

  await sendAssistantMessage({
    supabase: input.supabase,
    conversation: input.conversation,
    text: confirmation,
  });

  await input.supabase
    .from("conversations")
    .update({
      mode: "human",
      lifecycle_status: "escalation_requested",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.conversation.id);

  return true;
}
