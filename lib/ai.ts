import "server-only";

import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful admissions counselor AI assistant for a college/educational institution. You help prospective students with:
- Information about courses, programs, and admission requirements
- Answering questions about fees, schedules, and campus facilities
- Guiding them through the application process
- Providing general support and directing complex queries to human counselors

Keep responses concise and friendly (suitable for WhatsApp). Use short paragraphs.
If you don't know something specific, let them know a human counselor will follow up.
Do not use markdown formatting as this is WhatsApp. Use plain text only.`;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function getAIResponse(
  conversationHistory: ChatMessage[]
): Promise<string> {
  const model = process.env.AI_MODEL || "openai/gpt-4o-mini";

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-20), // Last 20 messages for context
  ];

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("Empty AI response");

    return response.trim();
  } catch (error) {
    console.error("[AI] Error getting response:", error);
    return "I'm sorry, I'm having trouble responding right now. A human counselor will get back to you shortly.";
  }
}
