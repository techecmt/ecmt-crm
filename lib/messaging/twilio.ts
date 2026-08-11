import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import type { ParsedInboundMessage } from "./types";

const WHATSAPP_PREFIX = "whatsapp:";

function normalizeWhatsAppAddress(address: string) {
  return address.startsWith(WHATSAPP_PREFIX)
    ? address.slice(WHATSAPP_PREFIX.length)
    : address;
}

function asTwilioWhatsAppAddress(address: string) {
  return address.startsWith(WHATSAPP_PREFIX)
    ? address
    : `${WHATSAPP_PREFIX}${address}`;
}

export function parseTwilioWhatsAppWebhook(
  form: URLSearchParams,
): ParsedInboundMessage | null {
  const from = form.get("From");
  const body = form.get("Body")?.trim();
  const messageSid = form.get("MessageSid");

  if (!from?.startsWith(WHATSAPP_PREFIX) || !body || !messageSid) {
    return null;
  }

  return {
    channel: "whatsapp",
    provider: "twilio",
    externalUserId: normalizeWhatsAppAddress(from),
    externalMessageId: messageSid,
    text: body,
    timestamp: String(Date.now()),
    // A sender can have multiple Twilio WhatsApp numbers. Keep their
    // conversations separate while still sharing the Message Centre UI.
    pageId: form.get("To") || null,
    name: form.get("ProfileName") || null,
  };
}

export function isValidTwilioSignature(input: {
  signature: string | null;
  webhookUrl: string;
  form: URLSearchParams;
}) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !input.signature) return false;

  const signedPayload = [...input.form.entries()]
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB),
    )
    .reduce((payload, [key, value]) => `${payload}${key}${value}`, input.webhookUrl);
  const expected = createHmac("sha1", authToken)
    .update(signedPayload, "utf8")
    .digest("base64");

  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function sendTwilioWhatsAppMessage(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    throw new Error(
      "Twilio WhatsApp credentials are not configured. Set account SID, auth token, and a sender or Messaging Service SID.",
    );
  }

  const requestBody = new URLSearchParams({
    To: asTwilioWhatsAppAddress(to),
    Body: body,
  });
  if (messagingServiceSid) {
    requestBody.set("MessagingServiceSid", messagingServiceSid);
  } else if (from) {
    requestBody.set("From", asTwilioWhatsAppAddress(from));
  }

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: requestBody.toString(),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("[Twilio] WhatsApp send failed:", error);
    throw new Error(`Twilio API error: ${response.status}`);
  }

  return response.json();
}
