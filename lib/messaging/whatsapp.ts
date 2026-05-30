import "server-only";

import type { ParsedInboundMessage } from "@/lib/messaging/types";

export async function sendWhatsAppMessage(to: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp env vars are not configured");
  }

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!res.ok) {
    const error = await res.text();
    console.error("[WhatsApp] Send failed:", error);
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  return res.json();
}

export function parseWhatsAppWebhook(body: unknown): ParsedInboundMessage | null {
  try {
    const data = body as WhatsAppWebhookPayload;
    if (data?.object !== "whatsapp_business_account") return null;

    const entry = data.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) return null;

    const message = value.messages[0];
    const contact = value.contacts?.[0];

    if (message.type !== "text") return null;

    return {
      channel: "whatsapp",
      externalUserId: message.from,
      name: contact?.profile?.name || null,
      text: message.text.body,
      timestamp: message.timestamp,
      externalMessageId: message.id,
      pageId: null,
    };
  } catch {
    return null;
  }
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    changes: Array<{
      value: {
        metadata?: {
          phone_number_id?: string;
        };
        messages?: Array<{
          from: string;
          type: string;
          text: { body: string };
          timestamp: string;
          id: string;
        }>;
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
      };
    }>;
  }>;
}
