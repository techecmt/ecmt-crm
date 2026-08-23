import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import type { ParsedInboundMessage } from "./types";

const WHATSAPP_PREFIX = "whatsapp:";

export type TwilioConnectionCredentials = {
  account_sid: string;
  auth_token: string;
  whatsapp_from?: string | null;
  messaging_service_sid?: string | null;
};

export type TwilioWhatsAppTemplate = {
  sid: string;
  friendlyName: string;
  language: string;
  body: string | null;
  variables: string[];
};

type TwilioContentRecord = {
  sid?: string;
  friendly_name?: string;
  language?: string;
  variables?: Record<string, string> | null;
  types?: Record<string, { body?: string }>;
  approvals?: Record<string, unknown>;
  approval_requests?: Record<string, unknown>;
};

function normalizeWhatsAppAddress(address: string) {
  return address.startsWith(WHATSAPP_PREFIX)
    ? address.slice(WHATSAPP_PREFIX.length)
    : address;
}

function senderMatchesWebhookRecipient(input: {
  webhookTo: string | null;
  connectionFrom: string | null | undefined;
}) {
  if (!input.connectionFrom) return true;
  if (!input.webhookTo) return false;
  return (
    normalizeWhatsAppAddress(input.webhookTo) ===
    normalizeWhatsAppAddress(input.connectionFrom)
  );
}

function asTwilioWhatsAppAddress(address: string) {
  return address.startsWith(WHATSAPP_PREFIX)
    ? address
    : `${WHATSAPP_PREFIX}${address}`;
}

export function parseTwilioWhatsAppWebhook(
  form: URLSearchParams,
  options?: {
    twilioConnectionId?: string | null;
    aiAgentId?: string | null;
  },
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
    twilioConnectionId: options?.twilioConnectionId ?? null,
    aiAgentId: options?.aiAgentId ?? null,
    pageId: null,
    name: form.get("ProfileName") || null,
  };
}

export function isValidTwilioSignatureForToken(input: {
  signature: string | null;
  webhookUrl: string;
  form: URLSearchParams;
  authToken: string;
}) {
  if (!input.authToken || !input.signature) return false;

  const signedPayload = [...input.form.entries()]
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB),
    )
    .reduce((payload, [key, value]) => `${payload}${key}${value}`, input.webhookUrl);
  const expected = createHmac("sha1", input.authToken)
    .update(signedPayload, "utf8")
    .digest("base64");

  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function isValidTwilioSignature(input: {
  signature: string | null;
  webhookUrl: string;
  form: URLSearchParams;
}) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  return isValidTwilioSignatureForToken({ ...input, authToken });
}

function normalizeCredentials(input: {
  accountSid: string;
  authToken: string;
  from?: string | null;
  messagingServiceSid?: string | null;
}) {
  if (!input.accountSid || !input.authToken || (!input.from && !input.messagingServiceSid)) {
    throw new Error(
      "Twilio WhatsApp credentials are not configured. Set account SID, auth token, and a sender or Messaging Service SID.",
    );
  }

  return {
    accountSid: input.accountSid,
    authToken: input.authToken,
    from: input.from ?? null,
    messagingServiceSid: input.messagingServiceSid ?? null,
  };
}

function credentialsFromEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!accountSid || !authToken) return null;
  try {
    return normalizeCredentials({ accountSid, authToken, from, messagingServiceSid });
  } catch {
    return null;
  }
}

function getTwilioCredentials(override?: TwilioConnectionCredentials) {
  if (override) {
    return normalizeCredentials({
      accountSid: override.account_sid.trim(),
      authToken: override.auth_token.trim(),
      from: override.whatsapp_from?.trim() || null,
      messagingServiceSid: override.messaging_service_sid?.trim() || null,
    });
  }

  const envCredentials = credentialsFromEnv();
  if (envCredentials) return envCredentials;
  return normalizeCredentials({
    accountSid: "",
    authToken: "",
    from: null,
    messagingServiceSid: null,
  });
}

function twilioAuthorization(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function addTwilioSender(
  requestBody: URLSearchParams,
  credentials: ReturnType<typeof getTwilioCredentials>,
) {
  if (credentials.messagingServiceSid) {
    requestBody.set("MessagingServiceSid", credentials.messagingServiceSid);
  } else if (credentials.from) {
    requestBody.set("From", asTwilioWhatsAppAddress(credentials.from));
  }
}

async function readTwilioError(response: Response) {
  const rawError = await response.text();
  try {
    const parsed = JSON.parse(rawError) as { code?: number; message?: string };
    if (parsed.code && parsed.message) {
      return `Twilio error ${parsed.code}: ${parsed.message}`;
    }
    if (parsed.message) return `Twilio: ${parsed.message}`;
  } catch {
    // Fall through to the HTTP status when Twilio did not return JSON.
  }
  return `Twilio API error: ${response.status}`;
}

export async function sendTwilioWhatsAppMessage(
  to: string,
  body: string,
  override?: TwilioConnectionCredentials,
) {
  const credentials = getTwilioCredentials(override);
  const requestBody = new URLSearchParams({
    To: asTwilioWhatsAppAddress(to),
    Body: body,
  });
  addTwilioSender(requestBody, credentials);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthorization(credentials.accountSid, credentials.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: requestBody.toString(),
    },
  );

  if (!response.ok) {
    const error = await readTwilioError(response);
    console.error("[Twilio] WhatsApp send failed:", error);
    throw new Error(error);
  }

  return response.json();
}

function approvalStatus(value: unknown): string | null {
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) {
    return value.map(approvalStatus).find(Boolean) ?? null;
  }
  if (value && typeof value === "object") {
    const record = value as { status?: unknown };
    if (typeof record.status === "string") return record.status.toLowerCase();
  }
  return null;
}

function extractTemplateBody(types: TwilioContentRecord["types"]) {
  if (!types) return null;
  return Object.values(types).find((content) => content?.body)?.body || null;
}

export async function listApprovedTwilioWhatsAppTemplates(
  override?: TwilioConnectionCredentials,
) {
  const credentials = getTwilioCredentials(override);
  const response = await fetch(
    "https://content.twilio.com/v1/ContentAndApprovals?PageSize=100",
    {
      headers: {
        Authorization: twilioAuthorization(credentials.accountSid, credentials.authToken),
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const error = await readTwilioError(response);
    console.error("[Twilio] Template list failed:", error);
    throw new Error(error);
  }

  const payload = (await response.json()) as { contents?: TwilioContentRecord[] };
  return (payload.contents ?? []).flatMap((content): TwilioWhatsAppTemplate[] => {
    const whatsappApproval =
      content.approvals?.whatsapp ?? content.approval_requests?.whatsapp;
    if (approvalStatus(whatsappApproval) !== "approved" || !content.sid) {
      return [];
    }

    const body = extractTemplateBody(content.types);
    const variables = Object.keys(content.variables ?? {});
    const inferredVariables =
      variables.length > 0
        ? variables
        : [...(body?.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g) ?? [])].map(
            (match) => match[1].trim(),
          );

    return [
      {
        sid: content.sid,
        friendlyName: content.friendly_name || content.sid,
        language: content.language || "en",
        body,
        variables: [...new Set(inferredVariables)],
      },
    ];
  });
}

export async function sendTwilioWhatsAppTemplate(input: {
  to: string;
  contentSid: string;
  variables?: Record<string, string>;
  credentials?: TwilioConnectionCredentials;
}) {
  const credentials = getTwilioCredentials(input.credentials);
  const requestBody = new URLSearchParams({
    To: asTwilioWhatsAppAddress(input.to),
    ContentSid: input.contentSid,
  });
  if (input.variables && Object.keys(input.variables).length > 0) {
    requestBody.set("ContentVariables", JSON.stringify(input.variables));
  }
  addTwilioSender(requestBody, credentials);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthorization(credentials.accountSid, credentials.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: requestBody.toString(),
    },
  );

  if (!response.ok) {
    const error = await readTwilioError(response);
    console.error("[Twilio] WhatsApp template send failed:", error);
    throw new Error(error);
  }

  return response.json();
}

export function resolveTwilioConnectionFromWebhook(input: {
  form: URLSearchParams;
  signature: string | null;
  webhookUrl: string;
  connections: Array<{
    id: string;
    agent_id: string | null;
    account_sid: string;
    auth_token: string;
    whatsapp_from: string | null;
  }>;
}) {
  const webhookTo = input.form.get("To");
  const webhookAccountSid = input.form.get("AccountSid");
  return input.connections.find((connection) => {
    if (
      webhookAccountSid &&
      connection.account_sid &&
      webhookAccountSid !== connection.account_sid
    ) {
      return false;
    }
    if (!senderMatchesWebhookRecipient({ webhookTo, connectionFrom: connection.whatsapp_from })) {
      return false;
    }
    return isValidTwilioSignatureForToken({
      signature: input.signature,
      webhookUrl: input.webhookUrl,
      form: input.form,
      authToken: connection.auth_token,
    });
  });
}
