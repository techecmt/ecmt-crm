import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMessengerProfileName } from "@/lib/messaging/messenger";
import { parseInboundWebhook } from "@/lib/messaging/router";
import { sendMessage } from "@/lib/messaging/send";
import { getAIResponse, type ChatMessage, type AIResult } from "@/lib/ai";
import type { ParsedInboundMessage } from "@/lib/messaging/types";
import { canonicalizePhoneKey } from "@/lib/phone";
import { isTerminalLeadStatus, type LeadStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken =
    process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token === expectedToken) {
    console.log("[Webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[Webhook] Verification failed — token mismatch");
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const parsed = parseInboundWebhook(body);
  if (!parsed) {
    return NextResponse.json({ status: "ignored" });
  }

  // Process in background to return 200 quickly
  processMessage(parsed).catch((err) =>
    console.error("[Webhook] Background processing error:", err)
  );

  return NextResponse.json({ status: "received" });
}

async function processMessage(parsed: ParsedInboundMessage) {
  const supabase = createAdminClient();

  // Deduplicate: check if we already processed this message.
  const { data: existingMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("external_msg_id", parsed.externalMessageId)
    .single();

  if (existingMsg) {
    console.log("[Webhook] Duplicate message ignored:", parsed.externalMessageId);
    return;
  }

  // Find or create conversation by channel/page/external user.
  const conversationMatch = supabase
    .from("conversations")
    .select("*")
    .eq("channel", parsed.channel)
    .eq("external_user_id", parsed.externalUserId);

  if (parsed.pageId) {
    conversationMatch.eq("page_id", parsed.pageId);
  } else {
    conversationMatch.is("page_id", null);
  }

  let incomingName = parsed.name;
  if (!incomingName && parsed.channel === "messenger") {
    incomingName = await fetchMessengerProfileName({
      externalUserId: parsed.externalUserId,
      pageId: parsed.pageId,
    });
  }

  const { data: existingConversation } = await conversationMatch.single();
  let conversation = existingConversation;

  if (!conversation) {
    // No auto-lead creation; just link if a matching lead already exists by phone.
    const inferredPhone =
      parsed.channel === "whatsapp" ? parsed.externalUserId : null;
    let leadId: string | null = null;
    if (inferredPhone) {
      const inferredPhoneKey = canonicalizePhoneKey(inferredPhone);
      if (inferredPhoneKey) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id,status")
          .eq("phone_key", inferredPhoneKey)
          .order("created_at", { ascending: false });
        const preferredLead =
          (leads ?? []).find((lead) => !isTerminalLeadStatus(lead.status as LeadStatus)) ??
          (leads ?? [])[0];
        leadId = preferredLead?.id ?? null;
      }
    }

    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({
        channel: parsed.channel,
        page_id: parsed.pageId,
        external_user_id: parsed.externalUserId,
        phone: inferredPhone,
        name: incomingName,
        lead_id: leadId,
        status: "open",
      })
      .select()
      .single();

    if (error) {
      console.error("[Webhook] Failed to create conversation:", error);
      return;
    }
    conversation = newConv;

    await autoAssignConversation(conversation.id);
  } else if (incomingName && !conversation.name) {
    await supabase
      .from("conversations")
      .update({ name: incomingName })
      .eq("id", conversation.id);
  }

  // Store user message
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: parsed.text,
    external_msg_id: parsed.externalMessageId,
    ...(parsed.channel === "whatsapp"
      ? { whatsapp_msg_id: parsed.externalMessageId }
      : {}),
  });

  // Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // If mode is 'human', stop here — don't auto-reply
  if (conversation.mode === "human") {
    console.log(
      "[Webhook] Human mode — skipping AI reply for",
      parsed.externalUserId,
    );
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

  let leadContext: string | null = null;
  let linkedConversationSummary: string | null = null;
  if (conversation.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("full_name, phone, email, interested_course, status")
      .eq("id", conversation.lead_id)
      .single();
    if (lead) {
      leadContext = [
        `Name: ${lead.full_name}`,
        `Phone: ${lead.phone || "-"}`,
        `Email: ${lead.email || "-"}`,
        `Interested course: ${lead.interested_course || "-"}`,
        `Lead status: ${lead.status || "-"}`,
      ].join("\n");
    }

    const { data: relatedConversations } = await supabase
      .from("conversations")
      .select("id, channel")
      .eq("lead_id", conversation.lead_id)
      .neq("id", conversation.id)
      .limit(3);

    if (relatedConversations?.length) {
      const ids = relatedConversations.map((c) => c.id);
      const { data: relatedMessages } = await supabase
        .from("messages")
        .select("conversation_id, role, content")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(12);

      if (relatedMessages?.length) {
        linkedConversationSummary = relatedMessages
          .map(
            (m) =>
              `${m.conversation_id.slice(0, 8)} ${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
          )
          .join("\n");
      }
    }
  }

  // Get AI response.
  const aiResult: AIResult = await getAIResponse({
    conversationHistory: chatHistory,
    channel: parsed.channel,
    leadContext,
    linkedConversationSummary,
  });

  await sendMessage(
    {
      channel: conversation.channel,
      external_user_id: conversation.external_user_id,
      page_id: conversation.page_id,
    },
    aiResult.reply,
  );

  // Store AI response in DB.
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: aiResult.reply,
  });

  // If AI flagged escalation, switch conversation to human mode.
  if (aiResult.shouldEscalate) {
    await supabase
      .from("conversations")
      .update({ mode: "human", updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
  } else {
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
  }
}

async function autoAssignConversation(conversationId: string) {
  if (process.env.AUTO_ASSIGN_CHATS !== "true") return;

  const supabase = createAdminClient();
  const { data: counsellors } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .in("role", ["counsellor", "admission_manager", "management", "super_admin"])
    .order("created_at", { ascending: true });

  if (!counsellors?.length) return;

  const { count } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .not("assigned_user_id", "is", null);

  const index = (count || 0) % counsellors.length;
  const assigneeId = counsellors[index]?.id;
  if (!assigneeId) return;

  await supabase
    .from("conversations")
    .update({ assigned_user_id: assigneeId })
    .eq("id", conversationId);
}
