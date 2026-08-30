import { createHash } from "crypto";

/**
 * Normalisation and de-duplication for WhatsApp Web chat imports.
 *
 * Kept out of the route handler so the two rules that matter most can be
 * exercised directly: idempotency keys must stay stable across re-imports, and
 * stored timestamps must preserve the on-screen order.
 */

export const MAX_MESSAGES_PER_IMPORT = 500;
export const MAX_MESSAGE_LENGTH = 4_000;

export type ImportMessage = {
  id?: unknown;
  text?: unknown;
  direction?: unknown;
  timestamp?: unknown;
};

export type ImportBody = {
  lead_id?: unknown;
  contact?: { name?: unknown; phone?: unknown; chat_identifier?: unknown };
  messages?: unknown;
};

export type NormalisedMessage = {
  externalMsgId: string;
  role: "user" | "assistant";
  content: string;
  /** Timestamp actually read from WhatsApp, or null when it could not be parsed. */
  parsedAt: string | null;
  /** Timestamp stored on the row: `parsedAt` when known, otherwise order-preserving. */
  createdAt: string;
};

/**
 * Stable idempotency key for a WhatsApp Web message.
 *
 * Keyed on the contact rather than the lead, so re-importing after the chat is
 * re-linked to a different lead still de-duplicates. A WhatsApp DOM message id
 * is used when available; otherwise the content fingerprint stands in.
 */
export function buildExternalMsgId(
  phoneKey: string,
  message: { id?: string | null; timestamp: string | null; direction: string; text: string },
): string {
  if (message.id) {
    return `whatsapp_web:${phoneKey}:${message.id}`.slice(0, 255);
  }
  const fingerprint = createHash("sha256")
    .update(`${message.timestamp ?? ""}|${message.direction}|${message.text}`)
    .digest("hex")
    .slice(0, 32);
  return `whatsapp_web:${phoneKey}:${fingerprint}`;
}

export function normaliseMessages(raw: unknown[], phoneKey: string): NormalisedMessage[] {
  const seen = new Set<string>();
  const result: Omit<NormalisedMessage, "createdAt">[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const message = entry as ImportMessage;

    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (!text) continue;

    const direction = message.direction === "outgoing" ? "outgoing" : "incoming";
    const domId = typeof message.id === "string" && message.id.trim() ? message.id.trim() : null;

    // Only accept a parseable timestamp; an unusable one must not become "now",
    // which would scramble the transcript order.
    let createdAt: string | null = null;
    if (typeof message.timestamp === "string") {
      const parsed = new Date(message.timestamp);
      if (!Number.isNaN(parsed.getTime())) createdAt = parsed.toISOString();
    }

    const content = text.slice(0, MAX_MESSAGE_LENGTH);
    const externalMsgId = buildExternalMsgId(phoneKey, {
      id: domId,
      timestamp: createdAt,
      direction,
      text: content,
    });

    // Collapse duplicates inside the payload itself before touching the DB.
    if (seen.has(externalMsgId)) continue;
    seen.add(externalMsgId);

    result.push({
      externalMsgId,
      // Message Centre roles: inbound is the contact, outbound is the counsellor.
      role: direction === "incoming" ? "user" : "assistant",
      content,
      parsedAt: createdAt,
    });
  }

  return assignOrderingTimestamps(result);
}

/**
 * Give every message a stored timestamp that preserves the on-screen order.
 *
 * WhatsApp Web only renders a time-of-day per message, so a row's date can fail
 * to parse. Letting those rows fall back to the column default would give a
 * whole batch one identical `created_at` and scramble the transcript, since the
 * lead Messages tab orders by it. Unknown timestamps are therefore interpolated
 * around their known neighbours.
 *
 * This never touches `externalMsgId`, which is derived from `parsedAt` only —
 * a synthesised timestamp in the idempotency key would change on every import
 * and defeat duplicate protection.
 */
export function assignOrderingTimestamps(
  messages: Omit<NormalisedMessage, "createdAt">[],
): NormalisedMessage[] {
  if (messages.length === 0) return [];

  const times: (number | null)[] = messages.map((message) =>
    message.parsedAt ? new Date(message.parsedAt).getTime() : null,
  );

  const firstKnown = times.findIndex((time) => time !== null);
  if (firstKnown === -1) {
    // Nothing parsed: anchor the run just before now, one second apart.
    const base = Date.now() - messages.length * 1_000;
    return messages.map((message, index) => ({
      ...message,
      createdAt: new Date(base + index * 1_000).toISOString(),
    }));
  }

  // Backfill before the first known timestamp.
  for (let index = firstKnown - 1; index >= 0; index -= 1) {
    times[index] = (times[index + 1] as number) - 1_000;
  }
  // Forward-fill everything after, keeping the sequence strictly increasing.
  for (let index = firstKnown + 1; index < times.length; index += 1) {
    const previous = times[index - 1] as number;
    const current = times[index];
    times[index] = current === null || current <= previous ? previous + 1_000 : current;
  }

  return messages.map((message, index) => ({
    ...message,
    createdAt: new Date(times[index] as number).toISOString(),
  }));
}
