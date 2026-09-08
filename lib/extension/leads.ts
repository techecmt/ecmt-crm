import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isTerminalLeadStatus,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type LeadSource,
  type LeadStatus,
} from "@/lib/types";

/**
 * Lead shape rendered by the extension panel. Existing lead fields only — the
 * extension never invents or stores anything the CRM does not already hold.
 */
export type ExtensionLeadCard = {
  id: string;
  full_name: string;
  phone: string;
  status: LeadStatus;
  status_label: string;
  source: LeadSource;
  source_label: string;
  college_name: string | null;
  interested_course: string | null;
  counsellor_name: string | null;
  is_terminal: boolean;
  created_at: string;
};

/** Mirrors the shape of LEADS_SELECT joins used across the CRM. */
export type ExtensionLeadRow = {
  id: string;
  full_name: string;
  phone: string;
  status: LeadStatus;
  source: LeadSource;
  interested_course: string | null;
  created_at: string;
  college: { id: string; name: string } | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

export const EXTENSION_LEAD_SELECT =
  "id, full_name, phone, status, source, interested_course, created_at, " +
  "college:colleges(id,name), " +
  "counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email)";

/**
 * PostgREST types embedded relations as arrays when it cannot prove a to-one
 * relationship. Both shapes are normalised here rather than at every call site.
 */
function toOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function toLeadCard(row: ExtensionLeadRow): ExtensionLeadCard {
  const college = toOne(row.college);
  const counsellor = toOne(row.counsellor);

  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    status: row.status,
    status_label: LEAD_STATUS_LABELS[row.status] ?? row.status,
    source: row.source,
    source_label: LEAD_SOURCE_LABELS[row.source] ?? row.source,
    college_name: college?.name ?? null,
    interested_course: row.interested_course,
    counsellor_name: counsellor?.full_name || counsellor?.email || null,
    is_terminal: isTerminalLeadStatus(row.status),
    created_at: row.created_at,
  };
}

/**
 * The same phone can legitimately have several leads (one per course), so the
 * most recent non-terminal lead wins, falling back to the newest overall.
 * This is the same preference the Message Centre convert-lead flow applies.
 */
export function pickPreferredLead<T extends { status: LeadStatus }>(
  leads: readonly T[],
): T | null {
  return (
    leads.find((lead) => !isTerminalLeadStatus(lead.status)) ?? leads[0] ?? null
  );
}

/** All leads on a canonical phone key, newest first. */
export async function findLeadsByPhoneKey(
  supabase: SupabaseClient,
  phoneKey: string,
): Promise<ExtensionLeadCard[]> {
  const { data, error } = await supabase
    .from("leads")
    .select(EXTENSION_LEAD_SELECT)
    .eq("phone_key", phoneKey)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ExtensionLeadRow[]).map(toLeadCard);
}

/**
 * Statuses the extension may set when creating a lead.
 *
 * Still narrower than PIPELINE_LEAD_STATUSES. A status is offered only where
 * the extension can satisfy the same preconditions the CRM's guarded
 * status-change flow enforces:
 *
 * - "Counselling In-Progress" seeds the follow-up schedule and records a
 *   `counselling_started` audit event.
 * - The two registration statuses require a completion date and record a
 *   `registration` audit event.
 *
 * Excluded: "Inactive Courses", which requires notes the capture form does not
 * collect, and "Counselling Completed", which belongs after a counselling
 * record exists rather than at first contact.
 */
export const EXTENSION_CREATE_STATUSES: readonly LeadStatus[] = [
  "inquiry_received",
  "counselling_in_progress",
  "no_response",
  "not_interested",
  "invalid",
  "registration_unpaid",
  "registered_paid_reg_fee",
];

/** Statuses that cannot be set without a registration completion date. */
export const REGISTRATION_STATUSES: readonly LeadStatus[] = [
  "registration_unpaid",
  "registered_paid_reg_fee",
];

export function requiresRegistrationDate(status: LeadStatus): boolean {
  return REGISTRATION_STATUSES.includes(status);
}

export function isExtensionCreateStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" &&
    (EXTENSION_CREATE_STATUSES as readonly string[]).includes(value)
  );
}

/** Status options for the extension's create form, in pipeline order. */
export function extensionStatusOptions(): {
  value: LeadStatus;
  label: string;
  requires_registration_date: boolean;
}[] {
  return EXTENSION_CREATE_STATUSES.map((status) => ({
    value: status,
    label: LEAD_STATUS_LABELS[status] ?? status,
    // Sent so the form knows to ask, without duplicating the rule client-side.
    requires_registration_date: requiresRegistrationDate(status),
  }));
}

/**
 * Source pre-selected for a lead captured from WhatsApp Web. Counsellors can
 * pick any other source — a WhatsApp conversation is often just where a
 * referral or campaign lead first reaches them, so forcing this one would
 * misattribute the channel in the marketing reports.
 */
export const DEFAULT_EXTENSION_SOURCE: LeadSource = "direct_calls_whatsapp";

export function isLeadSource(value: unknown): value is LeadSource {
  // hasOwnProperty, not `in`: the latter walks the prototype chain, which would
  // accept "toString" and "__proto__" as lead sources.
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(LEAD_SOURCE_LABELS, value)
  );
}

/** Every CRM lead source, in the CRM's own order. */
export function extensionSourceOptions(): { value: LeadSource; label: string }[] {
  return (Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((source) => ({
    value: source,
    label: LEAD_SOURCE_LABELS[source],
  }));
}
