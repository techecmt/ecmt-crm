import "server-only";

import { getAIResponse, type AIResult, type ChatMessage } from "@/lib/ai";
import { canonicalizePhoneKey } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTerminalLeadStatus, type LeadStatus } from "@/lib/types";
import { fetchMessengerProfileName } from "./messenger";
import { sendMessage } from "./send";
import type { ParsedInboundMessage } from "./types";

export async function processInboundMessage(parsed: ParsedInboundMessage) {
  const supabase = createAdminClient();

  const { data: existingMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("external_msg_id", parsed.externalMessageId)
    .single();

  if (existingMsg) {
    console.log("[Webhook] Duplicate message ignored:", parsed.externalMessageId);
    return;
  }

  const conversationMatch = supabase
    .from("conversations")
    .select("*")
    .eq("channel", parsed.channel)
    .eq("provider", parsed.provider)
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
        provider: parsed.provider,
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

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: parsed.text,
    external_msg_id: parsed.externalMessageId,
    ...(parsed.channel === "whatsapp"
      ? { whatsapp_msg_id: parsed.externalMessageId }
      : {}),
  });

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  if (conversation.mode === "human") {
    console.log(
      "[Webhook] Human mode — skipping AI reply for",
      parsed.externalUserId,
    );
    return;
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(30);

  const chatHistory: ChatMessage[] = (history || []).map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content,
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
      const ids = relatedConversations.map((related) => related.id);
      const { data: relatedMessages } = await supabase
        .from("messages")
        .select("conversation_id, role, content")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(12);

      if (relatedMessages?.length) {
        linkedConversationSummary = relatedMessages
          .map(
            (message) =>
              `${message.conversation_id.slice(0, 8)} ${message.role === "user" ? "User" : "Assistant"}: ${message.content}`,
          )
          .join("\n");
      }
    }
  }

  const aiResult: AIResult = await getAIResponse({
    conversationHistory: chatHistory,
    channel: parsed.channel,
    leadContext,
    linkedConversationSummary,
  });

  await sendMessage(
    {
      channel: conversation.channel,
      provider: conversation.provider,
      external_user_id: conversation.external_user_id,
      page_id: conversation.page_id,
    },
    aiResult.reply,
  );

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: aiResult.reply,
  });

  await supabase
    .from("conversations")
    .update(
      aiResult.shouldEscalate
        ? { mode: "human", updated_at: new Date().toISOString() }
        : { updated_at: new Date().toISOString() },
    )
    .eq("id", conversation.id);
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
