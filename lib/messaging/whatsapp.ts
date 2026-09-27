import "server-only";

import type {
  ParsedInboundMedia,
  ParsedInboundMessage,
  WhatsAppMediaType,
} from "@/lib/messaging/types";

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

export async function sendWhatsAppMediaMessage(input: {
  to: string;
  type: WhatsAppMediaType;
  mediaUrl: string;
  caption?: string;
  filename?: string | null;
}) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp env vars are not configured");
  }

  const payload =
    input.type === "image"
      ? {
          messaging_product: "whatsapp",
          to: input.to,
          type: "image",
          image: {
            link: input.mediaUrl,
            ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
          },
        }
      : {
          messaging_product: "whatsapp",
          to: input.to,
          type: "document",
          document: {
            link: input.mediaUrl,
            ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
            ...(input.filename?.trim() ? { filename: input.filename.trim() } : {}),
          },
        };

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const error = await res.text();
    console.error("[WhatsApp] Media send failed:", error);
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  return res.json();
}

function parseMetaInboundMedia(message: MetaInboundMessage): ParsedInboundMedia | null {
  if (message.type === "image" && message.image?.id) {
    return {
      type: "image",
      url: null,
      mimeType: message.image.mime_type ?? null,
      filename: null,
      providerMediaId: message.image.id,
    };
  }
  if (message.type === "document" && message.document?.id) {
    return {
      type: "document",
      url: null,
      mimeType: message.document.mime_type ?? null,
      filename: message.document.filename ?? null,
      providerMediaId: message.document.id,
    };
  }
  return null;
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
    const media = parseMetaInboundMedia(message);
    const text =
      message.type === "text"
        ? message.text?.body?.trim() || ""
        : message.type === "image"
          ? message.image?.caption?.trim() || "Image received"
          : message.type === "document"
            ? message.document?.caption?.trim() || "Document received"
            : "";
    if (!text && !media) return null;

    return {
      channel: "whatsapp",
      provider: "meta",
      aiAgentId: null,
      twilioConnectionId: null,
      externalUserId: message.from,
      name: contact?.profile?.name || null,
      text,
      timestamp: message.timestamp,
      externalMessageId: message.id,
      pageId: value.metadata?.phone_number_id || null,
      media,
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
        messages?: MetaInboundMessage[];
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
      };
    }>;
  }>;
}

interface MetaInboundMessage {
  from: string;
  type: string;
  timestamp: string;
  id: string;
  text?: {
    body?: string;
  };
  image?: {
    id?: string;
    mime_type?: string;
    caption?: string;
  };
  document?: {
    id?: string;
    mime_type?: string;
    filename?: string;
    caption?: string;
  };
}
