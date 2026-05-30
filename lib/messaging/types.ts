export type Channel = "whatsapp" | "messenger";

export interface ParsedInboundMessage {
  channel: Channel;
  externalUserId: string;
  externalMessageId: string;
  text: string;
  timestamp: string;
  pageId: string | null;
  name: string | null;
}

export interface OutboundMessage {
  channel: Channel;
  text: string;
  externalUserId: string;
  pageId?: string | null;
}
