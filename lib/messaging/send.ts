import "server-only";

import { sendMessengerMessage } from "@/lib/messaging/messenger";
import {
  sendTwilioWhatsAppMessage,
  type TwilioConnectionCredentials,
} from "@/lib/messaging/twilio";
import type { MessagingProvider } from "@/lib/messaging/types";
import { sendWhatsAppMessage } from "@/lib/messaging/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

type ConversationSendTarget = {
  channel: "whatsapp" | "messenger" | "website";
  provider?: MessagingProvider | null;
  external_user_id: string;
  page_id: string | null;
  twilio_connection_id?: string | null;
};

export async function sendMessage(conversation: ConversationSendTarget, text: string) {
  if (conversation.channel === "website") {
    // Website visitors receive the message by polling the secured widget API.
    return;
  }

  if (conversation.channel === "whatsapp") {
    if (conversation.provider === "twilio") {
      let credentials: TwilioConnectionCredentials | undefined;
      if (conversation.twilio_connection_id) {
        const supabase = createAdminClient();
        const { data: connection, error } = await supabase
          .from("twilio_connections")
          .select("account_sid, auth_token, whatsapp_from, messaging_service_sid")
          .eq("id", conversation.twilio_connection_id)
          .eq("is_active", true)
          .maybeSingle();
        if (error || !connection) {
          throw new Error("Twilio connection is missing or inactive");
        }
        credentials = connection;
      }
      await sendTwilioWhatsAppMessage(conversation.external_user_id, text, credentials);
      return;
    }

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
