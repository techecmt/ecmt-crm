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
 * Deliberately narrower than PIPELINE_LEAD_STATUSES. The CRM's own create form
 * fixes new leads at "Inquiry Received" because later statuses carry
 * preconditions that live in the guarded status-change flow: "Inactive Courses"
 * requires notes, the two registration statuses require a completion date and
 * emit `registration` audit events, and "Counselling Completed" belongs after a
 * counselling record exists. Offering those here would create leads that skip
 * validation and silently omit the audit events the registration and user-audit
 * reports are built on.
 *
 * What remains is the set that is genuinely meaningful at first contact.
 * "Counselling In-Progress" is included but is not a plain column write — see
 * `applyCounsellingStart` — so it stays consistent with the CRM.
 */
export const EXTENSION_CREATE_STATUSES: readonly LeadStatus[] = [
  "inquiry_received",
  "counselling_in_progress",
  "no_response",
  "not_interested",
  "invalid",
];

export function isExtensionCreateStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" &&
    (EXTENSION_CREATE_STATUSES as readonly string[]).includes(value)
  );
}

/** Status options for the extension's create form, in pipeline order. */
export function extensionStatusOptions(): { value: LeadStatus; label: string }[] {
  return EXTENSION_CREATE_STATUSES.map((status) => ({
    value: status,
    label: LEAD_STATUS_LABELS[status] ?? status,
  }));
}
