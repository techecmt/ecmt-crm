import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWhatsAppWebhook, sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse, type ChatMessage } from "@/lib/ai";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[Webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[Webhook] Verification failed — token mismatch");
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const parsed = parseWhatsAppWebhook(body);
  if (!parsed) {
    return NextResponse.json({ status: "ignored" });
  }

  // Process in background to return 200 quickly
  processMessage(parsed).catch((err) =>
    console.error("[Webhook] Background processing error:", err)
  );

  return NextResponse.json({ status: "received" });
}

async function processMessage(parsed: {
  from: string;
  name: string | null;
  body: string;
  timestamp: string;
  messageId: string;
}) {
  const supabase = createAdminClient();

  // Deduplicate: check if we already processed this message
  const { data: existingMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("whatsapp_msg_id", parsed.messageId)
    .single();

  if (existingMsg) {
    console.log("[Webhook] Duplicate message ignored:", parsed.messageId);
    return;
  }

  // Find or create conversation
  let { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("phone", parsed.from)
    .single();

  if (!conversation) {
    // Try to find matching lead by phone
    let { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("phone", parsed.from)
      .single();

    // If no lead exists, create one from the WhatsApp contact
    if (!lead) {
      const { data: newLead } = await supabase
        .from("leads")
        .insert({
          full_name: parsed.name || `WhatsApp ${parsed.from}`,
          phone: parsed.from,
          source: "direct_calls_whatsapp",
          status: "inquiry_received",
          lead_score: 0,
        })
        .select("id")
        .single();

      lead = newLead;

      // Log activity for the new lead
      if (lead) {
        await supabase.from("lead_activities").insert({
          lead_id: lead.id,
          type: "system",
          title: "Lead created from WhatsApp",
          description: `Auto-created when ${parsed.name || parsed.from} sent a WhatsApp message.`,
        });
      }
    }

    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({
        phone: parsed.from,
        name: parsed.name,
        lead_id: lead?.id || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[Webhook] Failed to create conversation:", error);
      return;
    }
    conversation = newConv;
  } else if (parsed.name && !conversation.name) {
    await supabase
      .from("conversations")
      .update({ name: parsed.name })
      .eq("id", conversation.id);
  }

  // Store user message
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: parsed.body,
    whatsapp_msg_id: parsed.messageId,
  });

  // Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // If mode is 'human', stop here — don't auto-reply
  if (conversation.mode === "human") {
    console.log("[Webhook] Human mode — skipping AI reply for", parsed.from);
    return;
  }

  // Fetch conversation history for AI context
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(30);

  const chatHistory: ChatMessage[] = (history || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Get AI response
  const aiResponse = await getAIResponse(chatHistory);

  // Send response via WhatsApp
  await sendWhatsAppMessage(parsed.from, aiResponse);

  // Store AI response in DB
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: aiResponse,
  });

  // Update conversation timestamp again
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
}
