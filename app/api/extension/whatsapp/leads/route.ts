import {
  authenticateExtensionRequest,
  extensionError,
  extensionJson,
  getRequestOrigin,
  handleExtensionPreflight,
} from "@/lib/extension/api";
import { pickPreferredLead } from "@/lib/extension/leads";
import { canonicalizePhoneKey } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Upper bound on one batch — WhatsApp only renders a few dozen chat rows at a time. */
const MAX_PHONES_PER_REQUEST = 100;

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}

type BatchLookupBody = { phones?: unknown };

type LeadStatusRow = { id: string; full_name: string; phone_key: string; status: LeadStatus };

/**
 * Batch phone → lead resolution for highlighting the WhatsApp chat list.
 *
 * Deliberately narrow: it returns only what a badge and its tooltip need, never
 * full lead records, and it is driven by the phone numbers already visible on
 * the counsellor's own screen.
 */
export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const { profile, response } = await authenticateExtensionRequest(origin, "read");
  if (!profile) return response;

  let body: BatchLookupBody;
  try {
    body = (await request.json()) as BatchLookupBody;
  } catch {
    return extensionError(origin, "Invalid request body", 400, "bad_request");
  }

  if (!Array.isArray(body.phones)) {
    return extensionError(origin, "`phones` must be an array", 400, "bad_request");
  }
  if (body.phones.length > MAX_PHONES_PER_REQUEST) {
    return extensionError(
      origin,
      `At most ${MAX_PHONES_PER_REQUEST} phone numbers per request`,
      400,
      "bad_request",
    );
  }

  // Canonicalise first so one DB round trip covers every input format.
  const keyByInput = new Map<string, string>();
  const phoneKeys = new Set<string>();
  for (const value of body.phones) {
    if (typeof value !== "string") continue;
    const key = canonicalizePhoneKey(value);
    if (!key) continue;
    keyByInput.set(value, key);
    phoneKeys.add(key);
  }

  if (phoneKeys.size === 0) {
    return extensionJson(origin, { results: [] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, full_name, phone_key, status")
    .in("phone_key", Array.from(phoneKeys))
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Extension] Batch lead lookup failed:", error.message);
    return extensionError(origin, "Unable to look up leads", 500, "server_error");
  }

  // Group by phone_key, then apply the same preference the single lookup uses.
  const byKey = new Map<string, LeadStatusRow[]>();
  for (const row of (data ?? []) as LeadStatusRow[]) {
    const existing = byKey.get(row.phone_key) ?? [];
    existing.push(row);
    byKey.set(row.phone_key, existing);
  }

  const results = Array.from(keyByInput.entries()).map(([phone, phoneKey]) => {
    const preferred = pickPreferredLead(byKey.get(phoneKey) ?? []);
    return {
      phone,
      phone_key: phoneKey,
      lead_id: preferred?.id ?? null,
      full_name: preferred?.full_name ?? null,
      status: preferred?.status ?? null,
      status_label: preferred ? LEAD_STATUS_LABELS[preferred.status] ?? preferred.status : null,
    };
  });

  return extensionJson(origin, { results });
}
