import "server-only";

import { parseMessengerWebhook } from "@/lib/messaging/messenger";
import type { ParsedInboundMessage } from "@/lib/messaging/types";
import { parseWhatsAppWebhook } from "@/lib/messaging/whatsapp";

export function parseInboundWebhook(body: unknown): ParsedInboundMessage | null {
  return parseWhatsAppWebhook(body) ?? parseMessengerWebhook(body);
}
