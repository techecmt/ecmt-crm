import type { TwilioCtwaReferral } from "@/lib/meta-ad-attribution";

export type Channel = "whatsapp" | "messenger" | "website";
export type MessagingProvider = "meta" | "twilio";

export type WhatsAppMediaType = "image" | "document";

export interface ParsedInboundMedia {
  type: WhatsAppMediaType;
  url: string | null;
  mimeType: string | null;
  filename: string | null;
  providerMediaId: string | null;
}

export interface ParsedInboundMessage {
  channel: Channel;
  provider: MessagingProvider;
  aiAgentId?: string | null;
  twilioConnectionId?: string | null;
  externalUserId: string;
  externalMessageId: string;
  text: string;
  timestamp: string;
  pageId: string | null;
  name: string | null;
  media?: ParsedInboundMedia | null;
  /** Present on Twilio inbound messages from Meta Click-to-WhatsApp ads. */
  ctwaReferral?: TwilioCtwaReferral | null;
}

export interface OutboundMessage {
  channel: Channel;
  provider?: MessagingProvider | null;
  text: string;
  externalUserId: string;
  pageId?: string | null;
}
