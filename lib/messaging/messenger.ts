import "server-only";

import type { ParsedInboundMessage } from "@/lib/messaging/types";
import { createAdminClient } from "@/lib/supabase/admin";

export function parseMessengerWebhook(body: unknown): ParsedInboundMessage | null {
  try {
    const data = body as MessengerWebhookPayload;
    if (data?.object !== "page") return null;

    const entry = data.entry?.[0];
    const event = entry?.messaging?.[0];
    if (!event?.message?.text) return null;

    return {
      channel: "messenger",
      externalUserId: event.sender.id,
      externalMessageId: event.message.mid,
      text: event.message.text,
      timestamp: String(event.timestamp ?? Date.now()),
      pageId: event.recipient?.id || entry?.id || null,
      name: null,
    };
  } catch {
    return null;
  }
}

export async function fetchMessengerProfileName(input: {
  externalUserId: string;
  pageId: string | null;
}) {
  if (!input.pageId) return null;

  const supabase = createAdminClient();
  const { data: page } = await supabase
    .from("messaging_pages")
    .select("access_token")
    .eq("channel", "messenger")
    .eq("page_id", input.pageId)
    .eq("is_active", true)
    .single();

  if (!page?.access_token) return null;

  try {
    const url = new URL(`https://graph.facebook.com/v22.0/${input.externalUserId}`);
    url.searchParams.set("fields", "name");
    url.searchParams.set("access_token", page.access_token);

    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const payload = (await res.json()) as { name?: string };
    return payload.name ?? null;
  } catch {
    return null;
  }
}

export async function sendMessengerMessage(input: {
  pageId: string;
  externalUserId: string;
  text: string;
}) {
  const supabase = createAdminClient();
  const { data: page } = await supabase
    .from("messaging_pages")
    .select("access_token")
    .eq("channel", "messenger")
    .eq("page_id", input.pageId)
    .eq("is_active", true)
    .single();

  if (!page?.access_token) {
    throw new Error("Messenger page is missing access token");
  }

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${input.pageId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${page.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: input.externalUserId },
        messaging_type: "RESPONSE",
        message: { text: input.text },
      }),
    },
  );

  if (!res.ok) {
    const error = await res.text();
    console.error("[Messenger] Send failed:", error);
    throw new Error(`Messenger API error: ${res.status}`);
  }

  return res.json();
}

interface MessengerWebhookPayload {
  object: string;
  entry: Array<{
    id?: string;
    messaging: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: {
        mid: string;
        text?: string;
      };
    }>;
  }>;
}
