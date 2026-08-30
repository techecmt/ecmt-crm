import {
  authenticateExtensionRequest,
  extensionError,
  extensionJson,
  getRequestOrigin,
  handleExtensionPreflight,
} from "@/lib/extension/api";
import {
  MAX_MESSAGES_PER_IMPORT,
  normaliseMessages,
  type ImportBody,
} from "@/lib/extension/whatsapp-messages";
import { canonicalizePhoneKey } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const { profile, response } = await authenticateExtensionRequest(origin, "write");
  if (!profile) return response;

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return extensionError(origin, "Invalid request body", 400, "bad_request");
  }

  const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
  if (!leadId) {
    return extensionError(origin, "`lead_id` is required", 400, "bad_request");
  }

  const contactPhone =
    typeof body.contact?.phone === "string" ? body.contact.phone.trim() : "";
  const phoneKey = canonicalizePhoneKey(contactPhone);
  if (!phoneKey) {
    return extensionError(origin, "A valid contact phone number is required", 400, "bad_request");
  }

  if (!Array.isArray(body.messages)) {
    return extensionError(origin, "`messages` must be an array", 400, "bad_request");
  }
  if (body.messages.length > MAX_MESSAGES_PER_IMPORT) {
    return extensionError(
      origin,
      `At most ${MAX_MESSAGES_PER_IMPORT} messages per import`,
      400,
      "bad_request",
    );
  }

  const contactName =
    typeof body.contact?.name === "string" && body.contact.name.trim()
      ? body.contact.name.replace(/\s+/g, " ").trim().slice(0, 160)
      : null;

  // The lead is read through the caller's own session so RLS decides what they
  // may see. A client-supplied lead_id is never trusted beyond this check.
  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, phone_key")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) {
    console.error("[Extension] Lead access check failed:", leadError.message);
    return extensionError(origin, "Unable to verify the lead", 500, "server_error");
  }
  if (!lead) {
    return extensionError(origin, "Lead not found", 404, "not_found");
  }
  // Guard against importing one contact's chat onto an unrelated lead.
  if (lead.phone_key && lead.phone_key !== phoneKey) {
    return extensionError(
      origin,
      "This chat's phone number does not match the selected lead",
      400,
      "bad_request",
    );
  }

  const messages = normaliseMessages(body.messages, phoneKey);
  if (messages.length === 0) {
    return extensionError(origin, "No importable text messages were found", 400, "bad_request");
  }

  // Conversation and message writes use the admin client, matching every other
  // non-cookie Message Centre writer in this codebase (inbound webhooks,
  // campaigns, website chat). Authorisation has already been fully decided
  // above from the session; nothing here is taken from the client unchecked.
  const admin = createAdminClient();

  const { data: existingConversation, error: conversationLookupError } = await admin
    .from("conversations")
    .select("id, lead_id, name")
    .eq("channel", "whatsapp")
    .eq("provider", "whatsapp_web")
    .eq("external_user_id", phoneKey)
    .is("page_id", null)
    .maybeSingle();

  if (conversationLookupError) {
    console.error("[Extension] Conversation lookup failed:", conversationLookupError.message);
    return extensionError(origin, "Unable to open the conversation", 500, "server_error");
  }

  let conversationId: string;
  if (existingConversation) {
    conversationId = existingConversation.id;
    // Append to the existing thread; never create a second one for this contact.
    const updates: Record<string, unknown> = {};
    if (!existingConversation.lead_id) updates.lead_id = leadId;
    if (!existingConversation.name && contactName) updates.name = contactName;
    if (Object.keys(updates).length > 0) {
      await admin.from("conversations").update(updates).eq("id", conversationId);
    }
  } else {
    const { data: created, error: createError } = await admin
      .from("conversations")
      .insert({
        channel: "whatsapp",
        provider: "whatsapp_web",
        external_user_id: phoneKey,
        phone: phoneKey,
        name: contactName,
        lead_id: leadId,
        status: "open",
        // A counsellor's own WhatsApp Web thread is human-handled by definition;
        // the AI agent must never pick it up and reply.
        mode: "human",
        bot_enabled: false,
      })
      .select("id")
      .single();

    if (createError || !created) {
      console.error("[Extension] Conversation create failed:", createError?.message);
      return extensionError(origin, "Unable to open the conversation", 500, "server_error");
    }
    conversationId = created.id;
  }

  // Duplicate protection: skip anything already stored under the same key.
  const { data: alreadyStored, error: existingError } = await admin
    .from("messages")
    .select("external_msg_id")
    .eq("conversation_id", conversationId)
    .in(
      "external_msg_id",
      messages.map((message) => message.externalMsgId),
    );

  if (existingError) {
    console.error("[Extension] Duplicate scan failed:", existingError.message);
    return extensionError(origin, "Unable to import messages", 500, "server_error");
  }

  const storedKeys = new Set(
    (alreadyStored ?? []).map((row) => row.external_msg_id as string),
  );
  const toInsert = messages.filter((message) => !storedKeys.has(message.externalMsgId));

  if (toInsert.length > 0) {
    const { error: insertError } = await admin.from("messages").insert(
      toInsert.map((message) => ({
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        external_msg_id: message.externalMsgId,
        whatsapp_msg_id: message.externalMsgId,
        // Outbound messages were sent by this counsellor from their own WhatsApp.
        sent_by_user_id: message.role === "assistant" ? profile.id : null,
        created_at: message.createdAt,
      })),
    );

    if (insertError) {
      console.error("[Extension] Message insert failed:", insertError.message);
      return extensionError(origin, "Unable to import messages", 500, "server_error");
    }

    await admin.from("lead_activities").insert({
      lead_id: leadId,
      user_id: profile.id,
      type: "system",
      title: "WhatsApp Web conversation imported",
      description: `Imported ${toInsert.length} message(s) from WhatsApp Web.`,
    });
  }

  return extensionJson(origin, {
    conversation_id: conversationId,
    imported: toInsert.length,
    skipped: messages.length - toInsert.length,
  });
}
