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

export type TwilioTemplateApprovalStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "received"
  | "unsubmitted"
  | "unknown";

export type TwilioContentTemplate = TwilioWhatsAppTemplate & {
  approvalStatus: TwilioTemplateApprovalStatus;
  approvalName: string | null;
  category: string | null;
  rejectionReason: string | null;
  contentType: string | null;
  dateCreated: string | null;
};

/** WhatsApp categories Twilio accepts on an approval request. */
export const TWILIO_TEMPLATE_CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;

export type TwilioTemplateCategory = (typeof TWILIO_TEMPLATE_CATEGORIES)[number];

type TwilioContentRecord = {
  sid?: string;
  friendly_name?: string;
  language?: string;
  date_created?: string;
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

const CONTENT_API_BASE = "https://content.twilio.com/v1";

type TwilioApprovalRecord = {
  status?: unknown;
  name?: unknown;
  category?: unknown;
  content_type?: unknown;
  rejection_reason?: unknown;
};

function normalizeApprovalStatus(value: unknown): TwilioTemplateApprovalStatus {
  const status = typeof value === "string" ? value.toLowerCase() : "";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "pending") return "pending";
  if (status === "received") return "received";
  if (status === "unsubmitted") return "unsubmitted";
  return "unknown";
}

/**
 * Twilio reports WhatsApp approval in two shapes: `ContentAndApprovals` returns
 * the fields flat under `approval_requests`, while `/ApprovalRequests` nests
 * them under a `whatsapp` key. Read whichever one we were handed.
 */
function extractWhatsAppApproval(content: TwilioContentRecord): TwilioApprovalRecord | null {
  const candidates: unknown[] = [
    (content.approval_requests as Record<string, unknown> | undefined)?.whatsapp,
    (content.approvals as Record<string, unknown> | undefined)?.whatsapp,
    content.approval_requests,
    content.approvals,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const record = candidate as TwilioApprovalRecord;
      if (record.status !== undefined) return record;
    }
  }
  return null;
}

function extractTemplateBody(types: TwilioContentRecord["types"]) {
  if (!types) return null;
  return Object.values(types).find((content) => content?.body)?.body || null;
}

function toContentTemplate(content: TwilioContentRecord): TwilioContentTemplate | null {
  if (!content.sid) return null;

  const approval = extractWhatsAppApproval(content);
  const body = extractTemplateBody(content.types);
  const declaredVariables = Object.keys(content.variables ?? {});
  const inferredVariables =
    declaredVariables.length > 0
      ? declaredVariables
      : [...(body?.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g) ?? [])].map((match) =>
          match[1].trim(),
        );

  return {
    sid: content.sid,
    friendlyName: content.friendly_name || content.sid,
    language: content.language || "en",
    body,
    variables: [...new Set(inferredVariables)],
    approvalStatus: approval ? normalizeApprovalStatus(approval.status) : "unsubmitted",
    approvalName: typeof approval?.name === "string" ? approval.name : null,
    category: typeof approval?.category === "string" ? approval.category : null,
    rejectionReason:
      typeof approval?.rejection_reason === "string" && approval.rejection_reason
        ? approval.rejection_reason
        : null,
    contentType:
      typeof approval?.content_type === "string"
        ? approval.content_type
        : Object.keys(content.types ?? {})[0] || null,
    dateCreated: content.date_created ?? null,
  };
}

async function twilioContentRequest(
  credentials: ReturnType<typeof getTwilioCredentials>,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  const url = path.startsWith("http") ? path : `${CONTENT_API_BASE}${path}`;
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: twilioAuthorization(credentials.accountSid, credentials.authToken),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readTwilioError(response));
  }
  if (response.status === 204) return null;
  return response.json();
}

/** Every Content template on the account, with its WhatsApp approval state. */
export async function listTwilioContentTemplates(
  override?: TwilioConnectionCredentials,
  options?: { maxPages?: number },
): Promise<TwilioContentTemplate[]> {
  const credentials = getTwilioCredentials(override);
  const maxPages = options?.maxPages ?? 10;

  const templates: TwilioContentTemplate[] = [];
  let path: string | null = "/ContentAndApprovals?PageSize=100";

  for (let page = 0; page < maxPages && path; page += 1) {
    const payload = (await twilioContentRequest(credentials, path)) as {
      contents?: TwilioContentRecord[];
      meta?: { next_page_url?: string | null };
    } | null;

    for (const content of payload?.contents ?? []) {
      const template = toContentTemplate(content);
      if (template) templates.push(template);
    }
    path = payload?.meta?.next_page_url ?? null;
  }

  return templates;
}

export async function listApprovedTwilioWhatsAppTemplates(
  override?: TwilioConnectionCredentials,
): Promise<TwilioWhatsAppTemplate[]> {
  const templates = await listTwilioContentTemplates(override);
  return templates
    .filter((template) => template.approvalStatus === "approved")
    .map(({ sid, friendlyName, language, body, variables }) => ({
      sid,
      friendlyName,
      language,
      body,
      variables,
    }));
}

export async function fetchTwilioContentTemplate(
  contentSid: string,
  override?: TwilioConnectionCredentials,
) {
  const credentials = getTwilioCredentials(override);
  const [content, approvals] = await Promise.all([
    twilioContentRequest(credentials, `/Content/${contentSid}`) as Promise<TwilioContentRecord>,
    twilioContentRequest(credentials, `/Content/${contentSid}/ApprovalRequests`).catch(
      () => null,
    ) as Promise<Record<string, unknown> | null>,
  ]);

  return toContentTemplate({ ...content, approvals: approvals ?? undefined });
}

/** WhatsApp template names must be lowercase alphanumeric with underscores. */
export function toWhatsAppTemplateName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

/**
 * Creates a Content template. Twilio Content resources are immutable: editing a
 * template means creating a new one and resubmitting it for approval.
 */
export async function createTwilioContentTemplate(input: {
  friendlyName: string;
  language: string;
  body: string;
  variableSamples?: Record<string, string>;
  credentials?: TwilioConnectionCredentials;
}) {
  const credentials = getTwilioCredentials(input.credentials);
  const payload = (await twilioContentRequest(credentials, "/Content", {
    method: "POST",
    body: {
      friendly_name: input.friendlyName,
      language: input.language,
      variables: input.variableSamples ?? {},
      types: { "twilio/text": { body: input.body } },
    },
  })) as TwilioContentRecord;

  return toContentTemplate(payload);
}

/** Submits an existing Content template to WhatsApp for approval. */
export async function submitTwilioTemplateForApproval(input: {
  contentSid: string;
  name: string;
  category: TwilioTemplateCategory;
  credentials?: TwilioConnectionCredentials;
}) {
  const credentials = getTwilioCredentials(input.credentials);
  return twilioContentRequest(
    credentials,
    `/Content/${input.contentSid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      body: { name: input.name, category: input.category },
    },
  );
}

export async function deleteTwilioContentTemplate(
  contentSid: string,
  override?: TwilioConnectionCredentials,
) {
  const credentials = getTwilioCredentials(override);
  await twilioContentRequest(credentials, `/Content/${contentSid}`, { method: "DELETE" });
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
