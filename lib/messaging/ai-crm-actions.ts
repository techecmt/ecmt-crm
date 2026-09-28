import "server-only";

import OpenAI from "openai";
import type { ChatMessage } from "@/lib/ai";
import { PIPELINE_LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import type { Channel } from "./types";

export type LeadAutomationField =
  | "full_name"
  | "email"
  | "phone"
  | "interested_course"
  | "city";

export type AgentAutomationSettings = {
  id: string | null;
  name: string | null;
  model: string | null;
  crm_automation_enabled: boolean;
  followup_automation_enabled: boolean;
  outbound_whatsapp_enabled: boolean;
  outbound_policy: "session_only" | "disabled";
  auto_apply_explicit_fields: string[];
  inference_allowed_fields: string[];
  require_status_approval: boolean;
  inference_min_confidence: number;
};

export type LeadAutomationSnapshot = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  interested_course: string | null;
  city: string | null;
  status: LeadStatus;
  assigned_counsellor: string | null;
};

type ExtractedPayload = {
  explicit: Partial<Record<LeadAutomationField, string>>;
  inferred: Partial<Record<LeadAutomationField, string>>;
  confidence: Partial<Record<LeadAutomationField | "status" | "follow_up", number>>;
  evidence: Partial<Record<LeadAutomationField | "status" | "follow_up", string>>;
  status_proposal?: {
    status?: string | null;
    reason?: string | null;
  } | null;
  follow_up?: {
    requested?: boolean;
    due_at?: string | null;
    followup_type?: "call" | "meeting" | "task" | "whatsapp" | "email" | "sms" | null;
    reason?: string | null;
    outbound_message?: string | null;
  } | null;
  escalation_requested?: boolean;
};

export type LeadFieldDecision = {
  field: LeadAutomationField;
  proposedValue: string;
  source: "explicit" | "inferred";
  confidence: number;
  evidence: string | null;
  action: "apply" | "conflict" | "skip";
  reason: string | null;
};

export type StatusDecision = {
  status: LeadStatus;
  reason: string | null;
  confidence: number;
  evidence: string | null;
  action: "queue" | "skip";
  skipReason?: string;
} | null;

export type FollowUpDecision = {
  action: "create_or_reschedule" | "skip";
  dueAt: string | null;
  followUpType: "call" | "meeting" | "task" | "whatsapp" | "email" | "sms";
  reason: string | null;
  confidence: number;
  evidence: string | null;
  outboundMessage: string | null;
  skipReason?: string;
} | null;

export type CrmActionDecision = {
  extraction: ExtractedPayload;
  fieldDecisions: LeadFieldDecision[];
  statusDecision: StatusDecision;
  followUpDecision: FollowUpDecision;
  escalationRequested: boolean;
};

const FIELD_TOKEN_TO_COLUMN: Record<string, LeadAutomationField> = {
  name: "full_name",
  fullname: "full_name",
  full_name: "full_name",
  email: "email",
  phone: "phone",
  mobile: "phone",
  course: "interested_course",
  interestedcourse: "interested_course",
  interested_course: "interested_course",
  city: "city",
};

function createAIClient() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseURL = process.env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : undefined;

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

function normalizeFieldToken(value: string) {
  return value.toLowerCase().replace(/[^a-z_]/g, "");
}

function fieldFromToken(value: string): LeadAutomationField | null {
  return FIELD_TOKEN_TO_COLUMN[normalizeFieldToken(value)] ?? null;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function boundedConfidence(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number < 0) return 0;
  if (number > 1) return 1;
  return number;
}

function parseJSONFromText(input: string): Record<string, unknown> | null {
  const trimmed = input.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    // fall through
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeStatus(value: string | null | undefined): LeadStatus | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z_]/g, "_");
  if ((PIPELINE_LEAD_STATUSES as string[]).includes(normalized)) {
    return normalized as LeadStatus;
  }
  const aliasMap: Record<string, LeadStatus> = {
    inquiry: "inquiry_received",
    inquiry_received: "inquiry_received",
    counselling: "counselling_in_progress",
    counselling_in_progress: "counselling_in_progress",
    counseling_in_progress: "counselling_in_progress",
    counselling_completed: "counselling_completed",
    counseling_completed: "counselling_completed",
    no_response: "no_response",
    not_interested: "not_interested",
    invalid: "invalid",
    invalid_contact: "invalid",
    course_not_started: "course_not_started",
    registration_unpaid: "registration_unpaid",
    registered_paid_reg_fee: "registered_paid_reg_fee",
    withdrawn: "withdrawn",
    dropped: "dropped",
  };
  return aliasMap[normalized] ?? null;
}

function extractFallbackPayload(lastUserMessage: string): ExtractedPayload {
  const explicit: Partial<Record<LeadAutomationField, string>> = {};
  const confidence: Partial<Record<LeadAutomationField | "status" | "follow_up", number>> = {};
  const evidence: Partial<Record<LeadAutomationField | "status" | "follow_up", string>> = {};
  const message = lastUserMessage.trim();

  const email = message.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  if (email) {
    explicit.email = email.toLowerCase();
    confidence.email = 0.99;
    evidence.email = email;
  }

  const phone = message.match(/(?<!\w)(?:\+?\d[\s()-]*){7,15}\d(?!\w)/)?.[0];
  if (phone) {
    explicit.phone = phone.replace(/[^\d+]/g, "");
    confidence.phone = 0.99;
    evidence.phone = phone;
  }

  const name =
    message.match(/\b(?:my name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z' -]{1,78})/i)?.[1] ?? null;
  if (name) {
    explicit.full_name = name.trim();
    confidence.full_name = 0.95;
    evidence.full_name = name;
  }

  const course =
    message.match(
      /\b(?:interested in|want to study|course is|looking for)\s+([A-Za-z0-9&/(),.' -]{2,100})/i,
    )?.[1] ?? null;
  if (course) {
    explicit.interested_course = course.replace(/[.!?].*$/, "").trim();
    confidence.interested_course = 0.92;
    evidence.interested_course = course;
  }

  const followRequested =
    /\b(call me|follow up|follow-up|reach me|contact me|later|tomorrow|next week)\b/i.test(message);

  return {
    explicit,
    inferred: {},
    confidence: {
      ...confidence,
      follow_up: followRequested ? 0.7 : 0,
    },
    evidence: {
      ...evidence,
      follow_up: followRequested ? message : "",
    },
    follow_up: followRequested
      ? {
          requested: true,
          reason: "Requested a follow-up in message.",
          followup_type: "call",
          due_at: null,
          outbound_message: null,
        }
      : null,
    status_proposal: null,
    escalation_requested: /(?:talk|speak|connect)\s+(?:to|with)\s+(?:a\s+)?(?:human|person|agent)/i.test(
      message,
    ),
  };
}

function readFieldRecord(
  value: unknown,
): Partial<Record<LeadAutomationField, string>> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<LeadAutomationField, string>> = {};
  for (const [key, raw] of Object.entries(record)) {
    const field = fieldFromToken(key);
    if (!field) continue;
    const normalized = normalizeText(raw);
    if (normalized) result[field] = normalized;
  }
  return result;
}

function readConfidenceRecord(
  value: unknown,
): Partial<Record<LeadAutomationField | "status" | "follow_up", number>> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<LeadAutomationField | "status" | "follow_up", number>> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (key === "status" || key === "follow_up") {
      result[key] = boundedConfidence(raw);
      continue;
    }
    const field = fieldFromToken(key);
    if (!field) continue;
    result[field] = boundedConfidence(raw);
  }
  return result;
}

function readEvidenceRecord(
  value: unknown,
): Partial<Record<LeadAutomationField | "status" | "follow_up", string>> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<LeadAutomationField | "status" | "follow_up", string>> = {};
  for (const [key, raw] of Object.entries(record)) {
    const text = normalizeText(raw);
    if (!text) continue;
    if (key === "status" || key === "follow_up") {
      result[key] = text;
      continue;
    }
    const field = fieldFromToken(key);
    if (!field) continue;
    result[field] = text;
  }
  return result;
}

async function extractWithModel(input: {
  settings: AgentAutomationSettings;
  channel: Channel;
  conversationHistory: ChatMessage[];
  lastUserMessage: string;
  lead: LeadAutomationSnapshot | null;
}) {
  const client = createAIClient();
  if (!client) return null;

  const model = input.settings.model?.trim() || "openai/gpt-4o-mini";
  const recentHistory = input.conversationHistory.slice(-8);
  const transcript = recentHistory
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  const leadSnapshot = input.lead
    ? [
        `Lead name: ${input.lead.full_name || "-"}`,
        `Lead email: ${input.lead.email || "-"}`,
        `Lead phone: ${input.lead.phone || "-"}`,
        `Lead course: ${input.lead.interested_course || "-"}`,
        `Lead city: ${input.lead.city || "-"}`,
        `Lead status: ${input.lead.status}`,
      ].join("\n")
    : "No linked lead yet.";

  const systemPrompt = [
    "You extract CRM automation signals from inbound student chat messages.",
    "Return ONLY JSON with keys: explicit, inferred, confidence, evidence, status_proposal, follow_up, escalation_requested.",
    "Only include facts actually present in the conversation for explicit fields.",
    "Use inferred only for low-risk guesses from context and keep confidence conservative.",
    "status_proposal.status must be a CRM status slug if strongly implied, else null.",
    "follow_up.requested should be true only when user intent indicates callback/defer/follow-up.",
    "If due time is unclear, set follow_up.due_at to null.",
    "No markdown, no explanations outside JSON.",
  ].join(" ");

  const userPrompt = [
    `Channel: ${input.channel}`,
    `Lead snapshot:\n${leadSnapshot}`,
    `Recent transcript:\n${transcript || "(empty)"}`,
    `Latest user message:\n${input.lastUserMessage}`,
  ].join("\n\n");

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 600,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseJSONFromText(raw);
  if (!parsed) return null;

  return {
    explicit: readFieldRecord(parsed.explicit),
    inferred: readFieldRecord(parsed.inferred),
    confidence: readConfidenceRecord(parsed.confidence),
    evidence: readEvidenceRecord(parsed.evidence),
    status_proposal:
      parsed.status_proposal && typeof parsed.status_proposal === "object"
        ? {
            status: normalizeText((parsed.status_proposal as Record<string, unknown>).status) || null,
            reason: normalizeText((parsed.status_proposal as Record<string, unknown>).reason) || null,
          }
        : null,
    follow_up:
      parsed.follow_up && typeof parsed.follow_up === "object"
        ? {
            requested: Boolean((parsed.follow_up as Record<string, unknown>).requested),
            due_at: normalizeText((parsed.follow_up as Record<string, unknown>).due_at) || null,
            followup_type: (() => {
              const rawType = normalizeText((parsed.follow_up as Record<string, unknown>).followup_type)
                .toLowerCase()
                .replace(/[^a-z]/g, "");
              if (
                rawType === "call" ||
                rawType === "meeting" ||
                rawType === "task" ||
                rawType === "whatsapp" ||
                rawType === "email" ||
                rawType === "sms"
              ) {
                return rawType as "call" | "meeting" | "task" | "whatsapp" | "email" | "sms";
              }
              return null;
            })(),
            reason: normalizeText((parsed.follow_up as Record<string, unknown>).reason) || null,
            outbound_message:
              normalizeText((parsed.follow_up as Record<string, unknown>).outbound_message) || null,
          }
        : null,
    escalation_requested: Boolean(parsed.escalation_requested),
  } satisfies ExtractedPayload;
}

export async function extractCrmPayload(input: {
  settings: AgentAutomationSettings;
  channel: Channel;
  conversationHistory: ChatMessage[];
  lastUserMessage: string;
  lead: LeadAutomationSnapshot | null;
}): Promise<ExtractedPayload> {
  if (!input.settings.crm_automation_enabled) {
    return {
      explicit: {},
      inferred: {},
      confidence: {},
      evidence: {},
      status_proposal: null,
      follow_up: null,
      escalation_requested: false,
    };
  }

  try {
    const extracted = await extractWithModel(input);
    if (extracted) return extracted;
  } catch (error) {
    console.error("[AI CRM] Structured extraction failed, falling back:", error);
  }
  return extractFallbackPayload(input.lastUserMessage);
}

export function buildCrmDecision(input: {
  settings: AgentAutomationSettings;
  lead: LeadAutomationSnapshot | null;
  extraction: ExtractedPayload;
}): CrmActionDecision {
  const explicitAllowed = new Set(
    (input.settings.auto_apply_explicit_fields ?? [])
      .map((field) => fieldFromToken(field))
      .filter(Boolean) as LeadAutomationField[],
  );
  const inferenceAllowed = new Set(
    (input.settings.inference_allowed_fields ?? [])
      .map((field) => fieldFromToken(field))
      .filter(Boolean) as LeadAutomationField[],
  );
  const minimumInferenceConfidence = boundedConfidence(input.settings.inference_min_confidence, 0.75);

  const fieldDecisions: LeadFieldDecision[] = [];
  const pushDecision = (
    source: "explicit" | "inferred",
    field: LeadAutomationField,
    value: string,
  ) => {
    const proposedValue = value.trim();
    if (!proposedValue) return;

    const allowed = source === "explicit" ? explicitAllowed.has(field) : inferenceAllowed.has(field);
    const confidence = boundedConfidence(input.extraction.confidence[field], source === "explicit" ? 0.85 : 0.6);
    const evidence = normalizeText(input.extraction.evidence[field]) || null;

    if (!allowed) {
      fieldDecisions.push({
        field,
        proposedValue,
        source,
        confidence,
        evidence,
        action: "skip",
        reason: "Field disabled by agent automation policy.",
      });
      return;
    }

    if (source === "inferred" && confidence < minimumInferenceConfidence) {
      fieldDecisions.push({
        field,
        proposedValue,
        source,
        confidence,
        evidence,
        action: "skip",
        reason: "Inference confidence below policy threshold.",
      });
      return;
    }

    const currentValue = normalizeText(input.lead?.[field]);
    if (currentValue && currentValue.toLowerCase() === proposedValue.toLowerCase()) {
      fieldDecisions.push({
        field,
        proposedValue,
        source,
        confidence,
        evidence,
        action: "skip",
        reason: "Same value already exists.",
      });
      return;
    }

    if (currentValue && currentValue.toLowerCase() !== proposedValue.toLowerCase()) {
      fieldDecisions.push({
        field,
        proposedValue,
        source,
        confidence,
        evidence,
        action: "conflict",
        reason: "Existing value differs; requires visible conflict logging.",
      });
      return;
    }

    fieldDecisions.push({
      field,
      proposedValue,
      source,
      confidence,
      evidence,
      action: "apply",
      reason: null,
    });
  };

  for (const [field, value] of Object.entries(input.extraction.explicit)) {
    if (!value) continue;
    pushDecision("explicit", field as LeadAutomationField, value);
  }
  for (const [field, value] of Object.entries(input.extraction.inferred)) {
    if (!value) continue;
    pushDecision("inferred", field as LeadAutomationField, value);
  }

  const normalizedStatus = normalizeStatus(input.extraction.status_proposal?.status);
  const statusDecision: StatusDecision = normalizedStatus
    ? {
        status: normalizedStatus,
        reason: input.extraction.status_proposal?.reason ?? null,
        confidence: boundedConfidence(input.extraction.confidence.status, 0.65),
        evidence: normalizeText(input.extraction.evidence.status) || null,
        action: input.settings.require_status_approval ? "queue" : "skip",
        skipReason: input.settings.require_status_approval
          ? undefined
          : "Status automation without approval is disabled by policy.",
      }
    : null;

  const followUpDueAt =
    input.extraction.follow_up?.due_at && !Number.isNaN(new Date(input.extraction.follow_up.due_at).getTime())
      ? new Date(input.extraction.follow_up.due_at).toISOString()
      : null;
  const followUpRequested = Boolean(input.extraction.follow_up?.requested || followUpDueAt);

  const followUpDecision: FollowUpDecision = followUpRequested
    ? {
        action: input.settings.followup_automation_enabled ? "create_or_reschedule" : "skip",
        dueAt: followUpDueAt,
        followUpType: input.extraction.follow_up?.followup_type ?? "call",
        reason: input.extraction.follow_up?.reason ?? "Student requested follow-up.",
        confidence: boundedConfidence(input.extraction.confidence.follow_up, 0.7),
        evidence: normalizeText(input.extraction.evidence.follow_up) || null,
        outboundMessage:
          input.settings.outbound_whatsapp_enabled && input.settings.outbound_policy !== "disabled"
            ? input.extraction.follow_up?.outbound_message ?? null
            : null,
        skipReason: input.settings.followup_automation_enabled
          ? undefined
          : "Follow-up automation disabled for this agent.",
      }
    : null;

  return {
    extraction: input.extraction,
    fieldDecisions,
    statusDecision,
    followUpDecision,
    escalationRequested: Boolean(input.extraction.escalation_requested),
  };
}

export async function extractAndDecideCrmActions(input: {
  settings: AgentAutomationSettings;
  channel: Channel;
  conversationHistory: ChatMessage[];
  lastUserMessage: string;
  lead: LeadAutomationSnapshot | null;
}): Promise<CrmActionDecision> {
  const extraction = await extractCrmPayload(input);
  return buildCrmDecision({
    settings: input.settings,
    lead: input.lead,
    extraction,
  });
}
