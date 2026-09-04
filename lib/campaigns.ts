/** Shared campaign vocabulary used by both the API routes and the UI. */

export type CampaignStatus =
  | "draft"
  | "queued"
  | "sending"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  sending: "Sending",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

export type CampaignRecipientStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

export const CAMPAIGN_RECIPIENT_STATUS_LABELS: Record<CampaignRecipientStatus, string> = {
  pending: "Pending",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

export const CAMPAIGN_SKIP_REASON_LABELS: Record<string, string> = {
  opted_out: "Opted out",
  do_not_contact: "Do not contact",
  recently_messaged: "Messaged recently",
  campaign_cancelled: "Campaign cancelled",
};

export type CampaignVariableBinding =
  | { source: "lead_field"; value: string }
  | { source: "static"; value: string }
  | { source: "link"; value: string };

export const CAMPAIGN_VARIABLE_SOURCES = ["lead_field", "static", "link"] as const;

export type CampaignVariableSource = (typeof CAMPAIGN_VARIABLE_SOURCES)[number];

export const CAMPAIGN_VARIABLE_SOURCE_LABELS: Record<CampaignVariableSource, string> = {
  lead_field: "Lead field",
  static: "Fixed text",
  link: "Link",
};

export type CampaignVariableMapping = Record<string, CampaignVariableBinding>;

/** Lead fields a template variable can be bound to. */
export const CAMPAIGN_LEAD_FIELDS = [
  { value: "full_name", label: "Full name" },
  { value: "first_name", label: "First name" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "interested_course", label: "Interested course" },
  { value: "city", label: "City" },
  { value: "nationality", label: "Nationality" },
  { value: "counsellor_name", label: "Assigned counsellor" },
  { value: "status_label", label: "Lead status" },
] as const;

export type CampaignLeadField = (typeof CAMPAIGN_LEAD_FIELDS)[number]["value"];

export type CampaignAudienceSource = "leads" | "conversations" | "manual";

export type CampaignAudienceSnapshot = {
  source: CampaignAudienceSource;
  description?: string;
  requested?: number;
  filters?: Record<string, unknown>;
};

export type WhatsAppCampaign = {
  id: string;
  name: string;
  twilio_connection_id: string;
  content_sid: string;
  template_name: string;
  template_language: string;
  template_body: string | null;
  variable_mapping: CampaignVariableMapping;
  audience: CampaignAudienceSnapshot;
  status: CampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  send_cap: number | null;
  skip_recent_days: number | null;
  cost_per_message: number;
  currency: string;
  error: string | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppCampaignRecipient = {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  conversation_id: string | null;
  phone: string;
  phone_key: string;
  full_name: string | null;
  variables: Record<string, string>;
  status: CampaignRecipientStatus;
  skip_reason: string | null;
  error: string | null;
  external_message_id: string | null;
  attempt_count: number;
  sent_at: string | null;
  created_at: string;
};

export type CampaignCounts = Record<CampaignRecipientStatus, number>;

export const EMPTY_CAMPAIGN_COUNTS: CampaignCounts = {
  pending: 0,
  sending: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
};

/**
 * WhatsApp rejects parameter values containing newlines, tabs, or runs of four
 * or more spaces, so both the builder and the API check values against this.
 */
export const VARIABLE_VALUE_MAX_LENGTH = 1024;

export function validateVariableValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Cannot be empty";
  if (/[\r\n]/.test(value)) return "Cannot contain line breaks";
  if (/\t/.test(value)) return "Cannot contain tabs";
  if (/ {4,}/.test(value)) return "Cannot contain four or more spaces in a row";
  if (trimmed.length > VARIABLE_VALUE_MAX_LENGTH) {
    return `Must be ${VARIABLE_VALUE_MAX_LENGTH} characters or fewer`;
  }
  return null;
}

/** Collapses anything WhatsApp would reject, applied to every resolved value. */
export function sanitiseVariableValue(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/** Accepts "example.com/x" as well as a full URL, and returns a sendable one. */
export function normaliseLinkValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Only add a scheme when there is none; never stack one on top of another.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function validateLinkValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Cannot be empty";
  const generic = validateVariableValue(trimmed);
  if (generic) return generic;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    return "Only http and https links are supported";
  }

  try {
    const url = new URL(normaliseLinkValue(trimmed));
    if (!url.hostname.includes(".")) return "Enter a full link, such as chat.whatsapp.com/AbC";
    return null;
  } catch {
    return "Not a valid link";
  }
}

/** Validation for one binding, shared by the builder and the create endpoint. */
export function validateVariableBinding(binding: CampaignVariableBinding): string | null {
  if (binding.source === "lead_field") return null;
  if (binding.source === "link") return validateLinkValue(binding.value);
  return validateVariableValue(binding.value);
}

export type ManualRecipientEntry = { phone: string; name: string | null };

export type ParsedManualRecipients = {
  entries: ManualRecipientEntry[];
  invalid: string[];
  duplicates: number;
  /**
   * Numbers typed without a country code that are not an obvious local format.
   * Left in the list, but flagged: a bare 10-digit number silently acquires
   * whatever country code its first digits happen to look like.
   */
  ambiguous: ManualRecipientEntry[];
};

/** True when the raw text states a country code, or is an unambiguous local number. */
function hasReliableCountryCode(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+") || trimmed.startsWith("00")) return true;
  const digits = trimmed.replace(/\D/g, "");
  // Singapore local formats the canonicaliser handles deterministically.
  return digits.length === 8 || (digits.length === 9 && digits.startsWith("0"));
}

/**
 * Parses pasted numbers. One recipient per line as `+6591234567` or
 * `+6591234567, Jane Tan`; a line of comma-separated numbers with no names is
 * treated as several recipients, since that is how phone lists are usually copied.
 */
export function parseManualRecipients(
  input: string,
  canonicalise: (phone: string) => string,
): ParsedManualRecipients {
  const entries: ManualRecipientEntry[] = [];
  const invalid: string[] = [];
  const ambiguous: ManualRecipientEntry[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  const push = (rawPhone: string, name: string | null) => {
    const key = canonicalise(rawPhone);
    if (!key) {
      if (rawPhone.trim()) invalid.push(rawPhone.trim());
      return;
    }
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    const entry = { phone: key, name: name?.trim() || null };
    entries.push(entry);
    if (!hasReliableCountryCode(rawPhone)) ambiguous.push(entry);
  };

  for (const line of input.split(/[\r\n;]+/)) {
    if (!line.trim()) continue;
    const fields = line.split(/[,\t]/).map((field) => field.trim()).filter(Boolean);
    if (fields.length === 0) continue;

    if (fields.length === 1) {
      push(fields[0], null);
      continue;
    }

    // Every field a phone number means this line is a list, not phone + name.
    const allPhones = fields.every((field) => Boolean(canonicalise(field)));
    if (allPhones) {
      for (const field of fields) push(field, null);
      continue;
    }

    push(fields[0], fields.slice(1).join(", "));
  }

  return { entries, invalid, duplicates, ambiguous };
}

/** Placeholder keys ({{1}}, {{name}}) in the order they appear in a template body. */
export function extractTemplateVariableKeys(body: string | null | undefined) {
  if (!body) return [] as string[];
  const keys = [...body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => match[1].trim());
  return [...new Set(keys)];
}

/** Renders a template body with resolved variables, for previews and inbox logs. */
export function renderTemplateBody(
  body: string | null | undefined,
  variables: Record<string, string>,
) {
  if (!body) return "";
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    const value = variables[key];
    return value === undefined || value === "" ? match : value;
  });
}

export function isCampaignRunning(status: CampaignStatus) {
  return status === "queued" || status === "sending";
}

export function campaignProgress(campaign: {
  total_recipients: number;
  sent_count: number;
  failed_count: number;
}) {
  if (campaign.total_recipients <= 0) return 0;
  const done = campaign.sent_count + campaign.failed_count;
  return Math.min(100, Math.round((done / campaign.total_recipients) * 100));
}
