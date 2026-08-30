import {
  authenticateExtensionRequest,
  extensionError,
  extensionJson,
  getRequestOrigin,
  handleExtensionPreflight,
} from "@/lib/extension/api";
import {
  EXTENSION_LEAD_SELECT,
  findLeadsByPhoneKey,
  pickPreferredLead,
  toLeadCard,
  type ExtensionLeadRow,
} from "@/lib/extension/leads";
import { classifyDuplicateMatches, type DuplicateCheckLead } from "@/lib/lead-duplicates";
import { canonicalizePhoneKey } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { isAssignableCounsellor } from "@/lib/types";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}

/* -------------------------------------------------------------------------- */
/*  GET — find the lead behind the open WhatsApp conversation.                 */
/* -------------------------------------------------------------------------- */

export async function GET(request: Request) {
  const origin = getRequestOrigin(request);
  const { profile, response } = await authenticateExtensionRequest(origin, "read");
  if (!profile) return response;

  const phone = new URL(request.url).searchParams.get("phone");
  const phoneKey = canonicalizePhoneKey(phone);
  if (!phoneKey) {
    return extensionError(origin, "A valid phone number is required", 400, "bad_request");
  }

  const supabase = await createClient();
  try {
    const leads = await findLeadsByPhoneKey(supabase, phoneKey);
    const preferred = pickPreferredLead(leads);

    return extensionJson(origin, {
      phone_key: phoneKey,
      lead: preferred,
      // The panel mentions siblings rather than merging or altering them.
      other_lead_count: Math.max(leads.length - (preferred ? 1 : 0), 0),
    });
  } catch (error) {
    console.error("[Extension] Lead lookup failed:", error);
    return extensionError(origin, "Unable to look up the lead", 500, "server_error");
  }
}

/* -------------------------------------------------------------------------- */
/*  POST — create a lead from the open WhatsApp conversation.                  */
/* -------------------------------------------------------------------------- */

type CreateLeadBody = {
  phone?: unknown;
  full_name?: unknown;
  interested_course?: unknown;
  college_id?: unknown;
  assign_to_me?: unknown;
};

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const { profile, response } = await authenticateExtensionRequest(origin, "write");
  if (!profile) return response;

  let body: CreateLeadBody;
  try {
    body = (await request.json()) as CreateLeadBody;
  } catch {
    return extensionError(origin, "Invalid request body", 400, "bad_request");
  }

  const phone = readText(body.phone, 40);
  const phoneKey = canonicalizePhoneKey(phone);
  if (!phone || !phoneKey) {
    return extensionError(origin, "A valid phone number is required", 400, "bad_request");
  }

  const fullName = readText(body.full_name, 160) ?? `WhatsApp lead ${phoneKey}`;
  const interestedCourse = readText(body.interested_course, 160);
  const collegeId = readText(body.college_id, 64);
  const supabase = await createClient();

  // Reuse the CRM's DB-authoritative duplicate matching rather than a second
  // rule set. An active match means the counsellor gets shown that lead
  // instead of quietly gaining a second one.
  const { data: duplicateRows, error: duplicateError } = await supabase.rpc(
    "get_lead_duplicate_matches",
    {
      p_phone: phone,
      p_college_id: collegeId,
      p_interested_course: interestedCourse,
      p_exclude_lead_id: null,
    },
  );
  if (duplicateError) {
    console.error("[Extension] Duplicate check failed:", duplicateError.message);
    return extensionError(origin, "Unable to check for duplicates", 500, "server_error");
  }

  const { activeMatches } = classifyDuplicateMatches(
    (duplicateRows ?? []) as DuplicateCheckLead[],
  );
  if (activeMatches.length > 0) {
    const existing = await findLeadsByPhoneKey(supabase, phoneKey);
    const preferred = pickPreferredLead(existing);
    return extensionJson(origin, {
      created: false,
      duplicate: true,
      phone_key: phoneKey,
      lead: preferred,
      other_lead_count: Math.max(existing.length - (preferred ? 1 : 0), 0),
    });
  }

  // Default the assignee to the counsellor doing the capture, but only when
  // their role is actually assignable.
  const assignToMe = body.assign_to_me !== false;
  const assignedCounsellor =
    assignToMe && isAssignableCounsellor(profile) ? profile.id : null;

  const { data: created, error: createError } = await supabase
    .from("leads")
    .insert({
      full_name: fullName,
      phone,
      phone_key: phoneKey,
      interested_course: interestedCourse,
      college_id: collegeId,
      source: "direct_calls_whatsapp",
      status: "inquiry_received",
      lead_score: 0,
      assigned_counsellor: assignedCounsellor,
      created_by: profile.id,
    })
    .select(EXTENSION_LEAD_SELECT)
    .single();

  if (createError || !created) {
    console.error("[Extension] Lead create failed:", createError?.message);
    return extensionError(
      origin,
      createError?.message || "Failed to create the lead",
      500,
      "server_error",
    );
  }

  const lead = toLeadCard(created as unknown as ExtensionLeadRow);

  await supabase.from("lead_activities").insert({
    lead_id: lead.id,
    user_id: profile.id,
    type: "system",
    title: "Lead created from WhatsApp Web",
    description: "Captured by the ECMT WhatsApp Web extension.",
  });

  return extensionJson(
    origin,
    { created: true, duplicate: false, phone_key: phoneKey, lead, other_lead_count: 0 },
    201,
  );
}
