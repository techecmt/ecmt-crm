import "server-only";

import { sendMessengerMessage } from "@/lib/messaging/messenger";
import { sendWhatsAppMessage } from "@/lib/messaging/whatsapp";

type ConversationSendTarget = {
  channel: "whatsapp" | "messenger" | "website";
  external_user_id: string;
  page_id: string | null;
};

export async function sendMessage(conversation: ConversationSendTarget, text: string) {
  if (conversation.channel === "website") {
    // Website visitors receive the message by polling the secured widget API.
    return;
  }

  if (conversation.channel === "whatsapp") {
    await sendWhatsAppMessage(conversation.external_user_id, text);
    return;
  }

  if (!conversation.page_id) {
    throw new Error("Messenger page_id is required");
  }

  await sendMessengerMessage({
    pageId: conversation.page_id,
    externalUserId: conversation.external_user_id,
    text,
  });
}
