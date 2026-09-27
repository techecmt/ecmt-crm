import "server-only";

import { getAIResponse, type AIResult, type ChatMessage } from "@/lib/ai";
import { canonicalizePhoneKey } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTerminalLeadStatus, type LeadSource, type LeadStatus } from "@/lib/types";
import { getAgentAvailability } from "./ai-availability";
import { captureCtwaAttributionForConversation } from "./capture-ctwa-attribution";
import { fetchMessengerProfileName } from "./messenger";
import { clearOptOut, detectOptOutIntent, recordOptOut } from "./opt-out";
import { sendMessage } from "./send";
import {
  buildCourseCatalogContext,
  filterAssetsByCooldown,
  selectCourseAssetsForMessage,
} from "./course-assets";
import type { ParsedInboundMessage } from "./types";

async function resolveInboundAgentId(
  supabase: ReturnType<typeof createAdminClient>,
  parsed: ParsedInboundMessage,
) {
  if (parsed.aiAgentId) return parsed.aiAgentId;

  if (parsed.provider === "meta" && parsed.pageId) {
    const { data: page } = await supabase
      .from("messaging_pages")
      .select("agent_id")
      .eq("channel", parsed.channel)
      .eq("page_id", parsed.pageId)
      .eq("is_active", true)
      .maybeSingle();
    if (page?.agent_id) return page.agent_id as string;
  }

  const { data: defaultAgent } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  return (defaultAgent?.id as string | undefined) ?? null;
}

function inferLeadSourceForInboundConversation(conversation: {
  provider: string | null;
  source: string | null;
  attribution_captured_at: string | null;
}): LeadSource {
  if (conversation.source === "meta_ads" || conversation.attribution_captured_at) {
    return "meta_ads";
  }
  if (conversation.provider === "twilio") {
    return "direct_calls_whatsapp";
  }
  return "facebook_organic";
}

async function ensureLeadForWhatsAppConversation(input: {
  supabase: ReturnType<typeof createAdminClient>;
  conversation: {
    id: string;
    channel: string;
    provider: string | null;
    phone: string | null;
    external_user_id: string;
    name: string | null;
    assigned_user_id: string | null;
    lead_id: string | null;
    source: string | null;
    attribution_captured_at: string | null;
  };
  incomingName: string | null;
}) {
  if (input.conversation.channel !== "whatsapp") return input.conversation.lead_id;
  if (input.conversation.lead_id) return input.conversation.lead_id;

  const inferredPhone = input.conversation.phone ?? input.conversation.external_user_id;
  const inferredPhoneKey = canonicalizePhoneKey(inferredPhone);
  if (!inferredPhoneKey) return null;

  const { data: leads } = await input.supabase
    .from("leads")
    .select("id,status")
    .eq("phone_key", inferredPhoneKey)
    .order("created_at", { ascending: false });
  const preferredLead =
    (leads ?? []).find((lead) => !isTerminalLeadStatus(lead.status as LeadStatus)) ??
    (leads ?? [])[0];

  let leadId = preferredLead?.id ?? null;
  if (!leadId) {
    const source = inferLeadSourceForInboundConversation({
      provider: input.conversation.provider,
      source: input.conversation.source,
      attribution_captured_at: input.conversation.attribution_captured_at,
    });
    const { data: createdLead, error: leadError } = await input.supabase
      .from("leads")
      .insert({
        full_name:
          input.incomingName ||
          input.conversation.name ||
          `Message lead ${inferredPhone}`,
        phone: inferredPhone,
        phone_key: inferredPhoneKey,
        source,
        status: "inquiry_received",
        lead_score: 0,
        assigned_counsellor: input.conversation.assigned_user_id || null,
      })
      .select("id")
      .single();

    if (leadError || !createdLead) {
      console.error("[Webhook] Failed to auto-create lead:", leadError);
      return null;
    }
    leadId = createdLead.id as string;
  }

  await input.supabase
    .from("conversations")
    .update({ lead_id: leadId })
    .eq("id", input.conversation.id)
    .is("lead_id", null);

  return leadId;
}

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

  if (parsed.provider === "twilio") {
    if (parsed.twilioConnectionId) {
      conversationMatch.eq("twilio_connection_id", parsed.twilioConnectionId);
    } else {
      conversationMatch.is("twilio_connection_id", null);
    }
  } else if (parsed.pageId) {
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
  if (
    !conversation &&
    parsed.provider === "meta" &&
    parsed.channel === "whatsapp" &&
    parsed.pageId
  ) {
    const { data: legacyConversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("channel", parsed.channel)
      .eq("provider", parsed.provider)
      .eq("external_user_id", parsed.externalUserId)
      .is("page_id", null)
      .maybeSingle();
    conversation = legacyConversation;
    if (conversation) {
      await supabase
        .from("conversations")
        .update({ page_id: parsed.pageId })
        .eq("id", conversation.id);
      conversation = { ...conversation, page_id: parsed.pageId };
    }
  }
  const inboundAgentId = await resolveInboundAgentId(supabase, parsed);

  if (!conversation) {
    const inferredPhone =
      parsed.channel === "whatsapp" ? parsed.externalUserId : null;

    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({
        channel: parsed.channel,
        provider: parsed.provider,
        page_id: parsed.pageId,
        twilio_connection_id: parsed.twilioConnectionId ?? null,
        external_user_id: parsed.externalUserId,
        phone: inferredPhone,
        name: incomingName,
        lead_id: null,
        ai_agent_id: inboundAgentId,
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
  } else {
    const updates: Record<string, unknown> = {};
    if (incomingName && !conversation.name) {
      updates.name = incomingName;
    }
    if (!conversation.ai_agent_id && inboundAgentId) {
      updates.ai_agent_id = inboundAgentId;
    }
    if (
      parsed.provider === "twilio" &&
      !conversation.twilio_connection_id &&
      parsed.twilioConnectionId
    ) {
      updates.twilio_connection_id = parsed.twilioConnectionId;
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("conversations").update(updates).eq("id", conversation.id);
      conversation = { ...conversation, ...updates };
    }
  }

  if (parsed.ctwaReferral) {
    const patch = await captureCtwaAttributionForConversation({
      supabase,
      conversationId: conversation.id,
      leadId: (conversation.lead_id as string | null) ?? null,
      existingAttributionCapturedAt:
        (conversation.attribution_captured_at as string | null) ?? null,
      referral: parsed.ctwaReferral,
    });
    if (patch) {
      conversation = { ...conversation, ...patch };
    }
  }

  const ensuredLeadId = await ensureLeadForWhatsAppConversation({
    supabase,
    conversation: {
      id: conversation.id,
      channel: conversation.channel as string,
      provider: (conversation.provider as string | null) ?? null,
      phone: (conversation.phone as string | null) ?? null,
      external_user_id: conversation.external_user_id as string,
      name: (conversation.name as string | null) ?? null,
      assigned_user_id: (conversation.assigned_user_id as string | null) ?? null,
      lead_id: (conversation.lead_id as string | null) ?? null,
      source: (conversation.source as string | null) ?? null,
      attribution_captured_at:
        (conversation.attribution_captured_at as string | null) ?? null,
    },
    incomingName,
  });
  if (ensuredLeadId && conversation.lead_id !== ensuredLeadId) {
    conversation = { ...conversation, lead_id: ensuredLeadId };
  }

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: parsed.text,
    external_msg_id: parsed.externalMessageId,
    media_type: parsed.media?.type ?? null,
    media_url: parsed.media?.url ?? null,
    media_mime_type: parsed.media?.mimeType ?? null,
    media_filename: parsed.media?.filename ?? null,
    provider_media_id: parsed.media?.providerMediaId ?? null,
    ...(parsed.channel === "whatsapp"
      ? { whatsapp_msg_id: parsed.externalMessageId }
      : {}),
  });

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // Opt-out keywords take priority over everything else on the channel.
  const optOutIntent =
    parsed.channel === "whatsapp" ? detectOptOutIntent(parsed.text) : null;
  if (optOutIntent === "opt_out") {
    await recordOptOut(supabase, {
      phone: parsed.externalUserId,
      leadId: conversation.lead_id ?? null,
      source: "stop_keyword",
    });
    await supabase
      .from("conversations")
      .update({ mode: "human", updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
    console.log("[Webhook] Opt-out recorded for", parsed.externalUserId);
    return;
  }
  if (optOutIntent === "opt_in") {
    await clearOptOut(supabase, parsed.externalUserId);
  }

  if (conversation.mode === "human") {
    console.log(
      "[Webhook] Human mode — skipping AI reply for",
      parsed.externalUserId,
    );
    return;
  }

  // The AI answers only while its agent is switched on and inside its hours.
  const availability = await getAgentAvailability(
    supabase,
    conversation.ai_agent_id ?? inboundAgentId,
  );
  if (!availability.available) {
    await supabase
      .from("conversations")
      .update({ mode: "human", updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    if (availability.offlineMessage) {
      const { data: lastAssistant } = await supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", conversation.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Send the away notice once per quiet period, not on every message.
      if (lastAssistant?.content !== availability.offlineMessage) {
        await sendMessage(
          {
            channel: conversation.channel,
            provider: conversation.provider,
            external_user_id: conversation.external_user_id,
            page_id: conversation.page_id,
            twilio_connection_id: conversation.twilio_connection_id ?? null,
          },
          availability.offlineMessage,
        );
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: availability.offlineMessage,
        });
      }
    }

    console.log(
      `[Webhook] AI unavailable (${availability.reason}) — handed to human for`,
      parsed.externalUserId,
    );
    return;
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(60);

  const chatHistory: ChatMessage[] = (history || []).map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content,
  }));

  let leadContext: string | null = null;
  let linkedConversationSummary: string | null = null;
  let leadInterestedCourse: string | null = null;
  if (conversation.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("full_name, phone, email, interested_course, status")
      .eq("id", conversation.lead_id)
      .single();
    if (lead) {
      leadInterestedCourse = (lead.interested_course as string | null) ?? null;
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
      .select("id, channel, updated_at")
      .eq("lead_id", conversation.lead_id)
      .neq("id", conversation.id)
      .order("updated_at", { ascending: false })
      .limit(6);

    if (relatedConversations?.length) {
      const ids = relatedConversations.map((related) => related.id);
      const { data: relatedMessages } = await supabase
        .from("messages")
        .select("conversation_id, role, content, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: true })
        .limit(60);

      if (relatedMessages?.length) {
        const byConversation = new Map<string, string[]>();
        for (const message of relatedMessages) {
          const roleLabel = message.role === "user" ? "User" : "Assistant";
          const list = byConversation.get(message.conversation_id) ?? [];
          list.push(`${roleLabel}: ${message.content}`);
          byConversation.set(message.conversation_id, list);
        }

        linkedConversationSummary = relatedConversations
          .map((related) => {
            const lines = byConversation.get(related.id) ?? [];
            if (!lines.length) return null;
            const latestLines = lines.slice(-4).join("\n");
            return `Conversation ${related.id.slice(0, 8)} (${related.channel})\n${latestLines}`;
          })
          .filter(Boolean)
          .join("\n\n");
      }
    }
  }

  const agentIdForReply = conversation.ai_agent_id ?? inboundAgentId;
  const { data: agentReplySettings } = agentIdForReply
    ? await supabase
        .from("ai_agents")
        .select("response_delay_ms")
        .eq("id", agentIdForReply)
        .maybeSingle()
    : { data: null };

  const responseDelayMs = Math.max(
    0,
    Math.min(30_000, Number(agentReplySettings?.response_delay_ms ?? 0)),
  );
  if (responseDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
  }

  const courseCatalogContext = await buildCourseCatalogContext({
    supabase,
    agentId: agentIdForReply,
  });

  const aiResult: AIResult = await getAIResponse({
    agentId: agentIdForReply,
    conversationHistory: chatHistory,
    channel: parsed.channel,
    leadContext,
    linkedConversationSummary,
    courseCatalogContext,
  });

  await sendMessage(
    {
      channel: conversation.channel,
      provider: conversation.provider,
      external_user_id: conversation.external_user_id,
      page_id: conversation.page_id,
      twilio_connection_id: conversation.twilio_connection_id ?? null,
    },
    aiResult.reply,
  );

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: aiResult.reply,
  });

  if (conversation.channel === "whatsapp") {
    const selectedAssets = await selectCourseAssetsForMessage({
      supabase,
      agentId: agentIdForReply,
      userText: parsed.text,
      leadInterestedCourse,
    });

    if (selectedAssets?.assets.length) {
      const assetsToSend = await filterAssetsByCooldown({
        supabase,
        conversationId: conversation.id,
        assets: selectedAssets.assets,
      });

      for (const asset of assetsToSend) {
        const fallbackCaption =
          asset.assetType === "brochure"
            ? `Brochure for ${selectedAssets.courseName}`
            : `Creative for ${selectedAssets.courseName}`;
        const caption = asset.caption.trim() || fallbackCaption;

        try {
          await sendMessage(
            {
              channel: conversation.channel,
              provider: conversation.provider,
              external_user_id: conversation.external_user_id,
              page_id: conversation.page_id,
              twilio_connection_id: conversation.twilio_connection_id ?? null,
            },
            caption,
            {
              type: asset.mediaType,
              url: asset.url,
              filename: asset.filename,
            },
          );
          await supabase.from("messages").insert({
            conversation_id: conversation.id,
            role: "assistant",
            content: caption,
            media_type: asset.mediaType,
            media_url: asset.url,
            media_mime_type: asset.mimeType,
            media_filename: asset.filename,
            provider_media_id: null,
            ai_course_catalog_id: selectedAssets.courseId,
            ai_course_asset_id: asset.id,
          });
        } catch (error) {
          console.error("[Webhook] Failed to send course asset:", error);
        }
      }
    }
  }

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
