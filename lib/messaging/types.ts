export type Channel = "whatsapp" | "messenger" | "website";
export type MessagingProvider = "meta" | "twilio";

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
}

export interface OutboundMessage {
  channel: Channel;
  provider?: MessagingProvider | null;
  text: string;
  externalUserId: string;
  pageId?: string | null;
}
