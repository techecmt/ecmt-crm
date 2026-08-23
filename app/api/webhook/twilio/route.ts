import { NextRequest, NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/messaging/process-inbound";
import {
  isValidTwilioSignature,
  parseTwilioWhatsAppWebhook,
  resolveTwilioConnectionFromWebhook,
} from "@/lib/messaging/twilio";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const signature = request.headers.get("x-twilio-signature");
  const supabase = createAdminClient();
  const { data: configuredConnections } = await supabase
    .from("twilio_connections")
    .select("id, agent_id, account_sid, auth_token, whatsapp_from")
    .eq("is_active", true);

  const matchedConnection = resolveTwilioConnectionFromWebhook({
    form,
    signature,
    webhookUrl: request.url,
    connections: configuredConnections ?? [],
  });

  const fallbackSignatureValid = isValidTwilioSignature({
    signature,
    webhookUrl: request.url,
    form,
  });

  if (!matchedConnection && !fallbackSignatureValid) {
    console.warn("[Twilio] Webhook signature validation failed");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = parseTwilioWhatsAppWebhook(form, {
    twilioConnectionId: matchedConnection?.id ?? null,
    aiAgentId: matchedConnection?.agent_id ?? null,
  });
  if (!parsed) {
    // Twilio also posts delivery/status and non-text events to this endpoint.
    return new NextResponse("<Response/>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  processInboundMessage(parsed).catch((error) =>
    console.error("[Twilio] Background processing error:", error),
  );

  return new NextResponse("<Response/>", {
    headers: { "Content-Type": "text/xml" },
  });
}
