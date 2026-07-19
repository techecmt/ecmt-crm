import "server-only";

import { createHash, randomBytes } from "crypto";

import { getAIResponse, type ChatMessage } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_BYTES = 32;
const MAX_MESSAGE_LENGTH = 4_000;

type WidgetConfig = {
  public_key: string;
  allowed_origins: string[];
  is_active: boolean;
};

export type VisitorData = {
  name?: string;
  email?: string;
  phone?: string;
  interested_courses?: string[];
  qualified?: boolean;
  qualification_met_at?: string;
};

type WebsiteConversation = {
  id: string;
  channel: "website";
  external_user_id: string;
  name: string | null;
  phone: string | null;
  lifecycle_status: string | null;
  bot_enabled: boolean;
  visitor_data: VisitorData | null;
};

export class WidgetRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const rateLimits = new Map<string, { count: number; resetsAt: number }>();

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cleanText(value: string, maxLength = 200) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]) {
  return allowedOrigins.some((allowed) => allowed === origin);
}

export function requireOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new WidgetRequestError("Origin is required", 403);

  try {
    return new URL(origin).origin;
  } catch {
    throw new WidgetRequestError("Invalid origin", 400);
  }
}

export function applyWidgetCors(response: Response, origin: string) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.set("Vary", "Origin");
  return response;
}

export async function ensureAllowedWidgetOrigin(publicKey: string, origin: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("website_widget_config")
    .select("public_key, allowed_origins, is_active")
    .eq("id", true)
    .eq("public_key", publicKey)
    .maybeSingle();

  const config = data as WidgetConfig | null;
  if (error || !config || !config.is_active) {
    throw new WidgetRequestError("Widget is unavailable", 403);
  }
  if (!isAllowedOrigin(origin, config.allowed_origins ?? [])) {
    throw new WidgetRequestError("This website is not allowed to use the widget", 403);
  }
}

export async function ensureConfiguredWidgetOrigin(origin: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("website_widget_config")
    .select("allowed_origins, is_active")
    .eq("id", true)
    .maybeSingle();

  if (error || !data?.is_active || !isAllowedOrigin(origin, data.allowed_origins ?? [])) {
    throw new WidgetRequestError("This website is not allowed to use the widget", 403);
  }
}

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || entry.resetsAt <= now) {
    rateLimits.set(key, { count: 1, resetsAt: now + windowMs });
    return;
  }
  if (entry.count >= limit) {
    throw new WidgetRequestError("Too many requests. Please try again shortly.", 429);
  }
  entry.count += 1;
}

export function parseWidgetMessage(value: unknown) {
  if (typeof value !== "string") {
    throw new WidgetRequestError("Message is required", 400);
  }
  const message = value.trim();
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    throw new WidgetRequestError(`Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters`, 400);
  }
  return message;
}

function extractVisitorData(message: string, existing: VisitorData): VisitorData {
  const next: VisitorData = { ...existing };
  const email = message.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  if (email) next.email = email.toLowerCase();

  const phone = message.match(/(?<!\w)(?:\+?\d[\s()-]*){7,15}\d(?!\w)/)?.[0];
  if (phone) next.phone = phone.replace(/[^\d+]/g, "");

  let name = message.match(
    /\b(?:my name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z' -]{1,78})/i,
  )?.[1];
  // Visitors often answer a contact request with only "Name + phone number".
  // Treat the remaining text as a name only when it contains no other content.
  if (!name && (email || phone)) {
    const contactReply = message
      .replace(email ?? "", "")
      .replace(phone ?? "", "")
      .replace(/\b(?:my\s+name\s+is|name\s*(?:is|:)?)\b/gi, "")
      .trim();
    if (/^[A-Za-z][A-Za-z' -]{0,78}$/.test(contactReply)) {
      name = contactReply;
    }
  }
  if (name) next.name = cleanText(name.replace(/[.,!?].*$/, ""));

  const course = message.match(
    /\b(?:interested in|interested\s+course\s+is|want to study|looking for|course\s*(?:is|:))\s+([A-Za-z0-9&/(),.' -]{2,100})/i,
  )?.[1] ?? message.match(
    /\b((?:advanced\s+)?diploma\s+(?:in\s+)?[A-Za-z0-9&/(),.' -]{2,90})/i,
  )?.[1];
  if (course) {
    const normalizedCourse = cleanText(course.replace(/[.!?].*$/, ""), 100);
    const courses = next.interested_courses ?? [];
    if (
      normalizedCourse &&
      !courses.some((item) => item.toLowerCase() === normalizedCourse.toLowerCase())
    ) {
      next.interested_courses = [...courses, normalizedCourse];
    }
  }

  const isQualified =
    Boolean(next.name || next.email || next.phone) &&
    Boolean(next.interested_courses?.length);
  if (isQualified && !next.qualified) {
    next.qualified = true;
    next.qualification_met_at = new Date().toISOString();
  }
  return next;
}

function visitorDataContext(data: VisitorData) {
  return [
    `Name: ${data.name || "not collected"}`,
    `Email: ${data.email || "not collected"}`,
    `Phone: ${data.phone || "not collected"}`,
    `Interested courses: ${data.interested_courses?.join(", ") || "not collected"}`,
    `Qualification: ${data.qualified ? "qualified" : "not qualified yet"}`,
  ].join("\n");
}

export function isExplicitHumanHandoffRequest(message: string) {
  return /(?:talk|speak|chat|connect|transfer|put me through)\s+(?:to|with)\s+(?:a\s+)?(?:human|person|agent|counsellor|counselor|admissions)|(?:human|person|agent|counsellor|counselor)\s+(?:please|now)|can i speak to (?:someone|admissions)/i.test(
    message,
  );
}

export async function createWebsiteConversation(input: {
  sourceUrl?: string;
  referrer?: string;
  utm?: Record<string, string>;
}) {
  const supabase = createAdminClient();
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const externalUserId = `web_${randomBytes(12).toString("hex")}`;

  const { data: settings } = await supabase
    .from("ai_settings")
    .select("greeting_message")
    .eq("id", true)
    .maybeSingle();
  const greeting =
    settings?.greeting_message?.trim() ||
    "Hi! How can I help you with courses or admissions today?";

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      channel: "website",
      external_user_id: externalUserId,
      status: "open",
      lifecycle_status: "new",
      bot_enabled: true,
      visitor_token_hash: hashToken(token),
      visitor_data: {},
      source_url: input.sourceUrl || null,
      referrer: input.referrer || null,
      utm: input.utm ?? {},
    })
    .select("id")
    .single();

  if (error || !conversation) {
    throw new Error(error?.message || "Unable to start a conversation");
  }

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: greeting,
  });
  if (messageError) throw new Error(messageError.message);

  return { conversationId: conversation.id as string, token, greeting };
}

export async function requireVisitorConversation(
  conversationId: string,
  token: string | null,
): Promise<WebsiteConversation> {
  if (!token) throw new WidgetRequestError("Visitor session is required", 401);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, channel, external_user_id, name, phone, lifecycle_status, bot_enabled, visitor_data",
    )
    .eq("id", conversationId)
    .eq("channel", "website")
    .eq("visitor_token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) throw new WidgetRequestError("Conversation not found", 404);
  return data as WebsiteConversation;
}

export async function submitWebsiteMessage(
  conversation: WebsiteConversation,
  content: string,
) {
  const supabase = createAdminClient();
  const visitorData = extractVisitorData(content, conversation.visitor_data ?? {});
  const now = new Date().toISOString();

  const { error: userMessageError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content,
  });
  if (userMessageError) throw new Error(userMessageError.message);

  const commonUpdates = {
    updated_at: now,
    visitor_data: visitorData,
    name: visitorData.name || conversation.name,
    phone: visitorData.phone || conversation.phone,
  };

  if (isExplicitHumanHandoffRequest(content)) {
    const { data: settings } = await supabase
      .from("ai_settings")
      .select("escalation_message")
      .eq("id", true)
      .maybeSingle();
    const acknowledgement =
      settings?.escalation_message?.trim() ||
      "I've let our admissions team know. Someone will follow up with you.";

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: acknowledgement,
    });
    await supabase
      .from("conversations")
      .update({
        ...commonUpdates,
        lifecycle_status: "escalation_requested",
        escalation_requested_at: now,
      })
      .eq("id", conversation.id);

    return { reply: acknowledgement, visitorData, lifecycleStatus: "escalation_requested" };
  }

  if (!conversation.bot_enabled) {
    await supabase.from("conversations").update(commonUpdates).eq("id", conversation.id);
    return {
      reply: null,
      visitorData,
      lifecycleStatus: conversation.lifecycle_status || "human_handled",
    };
  }

  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(30);
  if (historyError) throw new Error(historyError.message);

  const aiResult = await getAIResponse({
    channel: "website",
    conversationHistory: (history ?? []) as ChatMessage[],
    leadCaptureContext: visitorDataContext(visitorData),
    disableAutomaticEscalation: true,
  });

  const { error: assistantMessageError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: aiResult.reply,
  });
  if (assistantMessageError) throw new Error(assistantMessageError.message);

  const lifecycleStatus =
    conversation.lifecycle_status === "escalation_requested"
      ? "escalation_requested"
      : "bot_handled";
  await supabase
    .from("conversations")
    .update({ ...commonUpdates, lifecycle_status: lifecycleStatus })
    .eq("id", conversation.id);

  return { reply: aiResult.reply, visitorData, lifecycleStatus };
}

export function getVisitorToken(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}
