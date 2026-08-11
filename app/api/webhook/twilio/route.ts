import { NextRequest, NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/messaging/process-inbound";
import {
  isValidTwilioSignature,
  parseTwilioWhatsAppWebhook,
} from "@/lib/messaging/twilio";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const signature = request.headers.get("x-twilio-signature");

  if (
    !isValidTwilioSignature({
      signature,
      webhookUrl: request.url,
      form,
    })
  ) {
    console.warn("[Twilio] Webhook signature validation failed");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = parseTwilioWhatsAppWebhook(form);
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
