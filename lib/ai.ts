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

type AIInput = {
  conversationHistory: ChatMessage[];
  channel: Channel;
  leadContext?: string | null;
  linkedConversationSummary?: string | null;
};

function channelInstruction(channel: Channel) {
  if (channel === "whatsapp") {
    return "Output plain text only. Do not use markdown.";
  }
  return "Keep formatting lightweight and readable for Messenger. Do not use heavy markdown.";
}

export async function getAIResponse(input: AIInput): Promise<string> {
  const client = createAIClient();
  if (!client) {
    console.error(
      "[AI] Missing API key. Set OPENROUTER_API_KEY (preferred) or OPENAI_API_KEY."
    );
    return "Thanks for your message. Our counselor team will reply shortly.";
  }

  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("ai_settings")
    .select("system_prompt, model, temperature, max_tokens")
    .eq("id", true)
    .single();

  const { data: knowledgeRows } = await supabase
    .from("ai_knowledge")
    .select("title, content")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const model = settings?.model || process.env.AI_MODEL || "openai/gpt-4o-mini";
  const maxTokens = settings?.max_tokens || 500;
  const temperature = Number(settings?.temperature ?? 0.7);

  const knowledge = (knowledgeRows || [])
    .map((k) => `- ${k.title}\n${k.content}`)
    .join("\n\n");

  const systemSections = [
    settings?.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT,
    channelInstruction(input.channel),
    input.leadContext ? `Lead context:\n${input.leadContext}` : null,
    input.linkedConversationSummary
      ? `Related conversation memory:\n${input.linkedConversationSummary}`
      : null,
    knowledge ? `Knowledge base:\n${knowledge}` : null,
  ].filter(Boolean);

  const messages: ChatMessage[] = [
    { role: "system", content: systemSections.join("\n\n") },
    ...input.conversationHistory.slice(-20),
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

    return response.trim();
  } catch (error) {
    console.error("[AI] Error getting response:", error);
    return "I'm sorry, I'm having trouble responding right now. A human counselor will get back to you shortly.";
  }
}
