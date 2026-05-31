import "server-only";

import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/messaging/types";

const DEFAULT_SYSTEM_PROMPT = `You are a helpful admissions counselor AI assistant for a college/educational institution. You help prospective students with:
- Information about courses, programs, and admission requirements
- Answering questions about fees, schedules, and campus facilities
- Guiding them through the application process
- Providing general support and directing complex queries to human counselors

Keep responses concise and friendly. Use short paragraphs.
If you don't know something specific, let them know a human counselor will follow up.`;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

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

export type AIInput = {
  conversationHistory: ChatMessage[];
  channel: Channel;
  leadContext?: string | null;
  linkedConversationSummary?: string | null;
};

export type AIResult = {
  reply: string;
  shouldEscalate: boolean;
};

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional_friendly:
    "Maintain a professional yet warm and approachable tone. Be helpful and positive.",
  formal:
    "Use formal language. Be respectful, precise and avoid colloquialisms.",
  casual:
    "Be conversational and casual. Use a friendly, relaxed style — like chatting with a friend.",
  empathetic:
    "Be deeply empathetic and understanding. Acknowledge feelings before providing solutions.",
};

function channelInstruction(channel: Channel) {
  if (channel === "whatsapp") {
    return "Output plain text only. Do not use markdown.";
  }
  return "Keep formatting lightweight and readable for Messenger. Do not use heavy markdown.";
}

function checkEscalation(
  text: string,
  keywords: string[],
): boolean {
  if (!keywords.length) return false;
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export async function getAIResponse(input: AIInput): Promise<AIResult> {
  const fallbackResult: AIResult = {
    reply:
      "Thanks for your message. Our counselor team will reply shortly.",
    shouldEscalate: false,
  };

  const client = createAIClient();
  if (!client) {
    console.error(
      "[AI] Missing API key. Set OPENROUTER_API_KEY (preferred) or OPENAI_API_KEY.",
    );
    return fallbackResult;
  }

  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("ai_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (settings && !settings.is_active) {
    return {
      reply:
        settings.fallback_message ||
        "Our AI assistant is currently offline. A counselor will respond shortly.",
      shouldEscalate: true,
    };
  }

  const { data: knowledgeRows } = await supabase
    .from("ai_knowledge")
    .select("title, content, category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const model = settings?.model || process.env.AI_MODEL || "openai/gpt-4o-mini";
  const maxTokens = settings?.max_tokens || 500;
  const temperature = Number(settings?.temperature ?? 0.7);
  const maxHistory = settings?.max_history_messages || 20;

  const lastUserMsg =
    input.conversationHistory.filter((m) => m.role === "user").pop()?.content ?? "";

  const escalationKeywords: string[] = settings?.escalation_keywords ?? [];
  const shouldEscalate =
    settings?.escalation_enabled !== false &&
    checkEscalation(lastUserMsg, escalationKeywords);

  if (shouldEscalate) {
    return {
      reply:
        settings?.escalation_message ||
        "I'm connecting you with a human counselor. They'll be with you shortly.",
      shouldEscalate: true,
    };
  }

  const knowledge = (knowledgeRows || [])
    .map((k) => `[${k.category ?? "general"}] ${k.title}\n${k.content}`)
    .join("\n\n");

  const toneKey = settings?.tone || "professional_friendly";
  const toneInstruction = TONE_INSTRUCTIONS[toneKey] || TONE_INSTRUCTIONS.professional_friendly;

  const systemSections = [
    settings?.persona?.trim()
      ? `Your name is ${settings.agent_name || "Assistant"}. ${settings.persona}`
      : settings?.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT,
    `Tone: ${toneInstruction}`,
    channelInstruction(input.channel),
    input.leadContext ? `Lead context:\n${input.leadContext}` : null,
    input.linkedConversationSummary
      ? `Related conversation memory:\n${input.linkedConversationSummary}`
      : null,
    knowledge ? `Knowledge base:\n${knowledge}` : null,
    settings?.auto_collect_lead
      ? `If the user hasn't shared their ${(settings.lead_collect_fields || []).join(", ")}, politely ask for them.`
      : null,
  ].filter(Boolean);

  const messages: ChatMessage[] = [
    { role: "system", content: systemSections.join("\n\n") },
    ...input.conversationHistory.slice(-maxHistory),
  ];

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("Empty AI response");

    return { reply: response.trim(), shouldEscalate: false };
  } catch (error) {
    console.error("[AI] Error getting response:", error);
    return {
      reply:
        settings?.fallback_message ||
        "I'm sorry, I'm having trouble responding right now. A human counselor will get back to you shortly.",
      shouldEscalate: false,
    };
  }
}
