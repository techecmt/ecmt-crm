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
  | { source: "static"; value: string };

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

export type CampaignAudienceSnapshot = {
  source: "leads" | "conversations";
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
