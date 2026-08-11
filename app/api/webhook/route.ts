import { NextRequest, NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/messaging/process-inbound";
import { parseInboundWebhook } from "@/lib/messaging/router";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken =
    process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token === expectedToken) {
    console.log("[Webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[Webhook] Verification failed — token mismatch");
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const parsed = parseInboundWebhook(body);
  if (!parsed) {
    return NextResponse.json({ status: "ignored" });
  }

  // Process in background to return 200 quickly
  processInboundMessage(parsed).catch((err) =>
    console.error("[Webhook] Background processing error:", err)
  );

  return NextResponse.json({ status: "received" });
}
