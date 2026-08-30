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
  isExtensionCreateStatus,
  pickPreferredLead,
  toLeadCard,
  type ExtensionLeadRow,
} from "@/lib/extension/leads";
import { classifyDuplicateMatches, type DuplicateCheckLead } from "@/lib/lead-duplicates";
import { canonicalizePhoneKey } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { isAssignableCounsellor, type LeadStatus, type UserRole } from "@/lib/types";

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
  status?: unknown;
  assigned_counsellor?: unknown;
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

  // Status is restricted to what is valid at first contact; anything else has
  // preconditions that only the CRM's guarded status-change flow can satisfy.
  const status: LeadStatus = isExtensionCreateStatus(body.status)
    ? body.status
    : "inquiry_received";
  if (body.status !== undefined && !isExtensionCreateStatus(body.status)) {
    return extensionError(
      origin,
      "That status cannot be set when creating a lead from WhatsApp",
      400,
      "bad_request",
    );
  }

  // Never trust a client-supplied college: it must exist and be active, and a
  // course must belong to it when that college publishes a course list.
  if (collegeId) {
    const { data: college, error: collegeError } = await supabase
      .from("colleges")
      .select("id, courses")
      .eq("id", collegeId)
      .eq("is_active", true)
      .maybeSingle();
    if (collegeError) {
      console.error("[Extension] College check failed:", collegeError.message);
      return extensionError(origin, "Unable to verify the college", 500, "server_error");
    }
    if (!college) {
      return extensionError(origin, "Unknown college", 400, "bad_request");
    }
    const courses = ((college.courses as string[] | null) ?? [])
      .map((course) => course.trim())
      .filter(Boolean);
    if (interestedCourse && courses.length > 0 && !courses.includes(interestedCourse)) {
      return extensionError(
        origin,
        "That course is not offered by the selected college",
        400,
        "bad_request",
      );
    }
  }

  // "Not specified" and "explicitly unassigned" must not collapse into the same
  // thing: omitting the field falls back to the counsellor doing the capture,
  // while sending null is a deliberate choice to leave the lead unassigned.
  const counsellorProvided = body.assigned_counsellor !== undefined;
  const requestedCounsellor = readText(body.assigned_counsellor, 64);
  let assignedCounsellor: string | null = null;
  if (requestedCounsellor) {
    const { data: candidate, error: candidateError } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", requestedCounsellor)
      .maybeSingle();
    if (candidateError) {
      console.error("[Extension] Counsellor check failed:", candidateError.message);
      return extensionError(origin, "Unable to verify the counsellor", 500, "server_error");
    }
    const row = candidate as { id: string; role: UserRole; is_active: boolean } | null;
    if (!row || !isAssignableCounsellor(row)) {
      return extensionError(origin, "That counsellor cannot be assigned", 400, "bad_request");
    }
    assignedCounsellor = row.id;
  } else if (!counsellorProvided && isAssignableCounsellor(profile)) {
    assignedCounsellor = profile.id;
  }

  // The CRM requires an owner before counselling starts, and the follow-up
  // seeding below is meaningless without one.
  if (status === "counselling_in_progress" && !assignedCounsellor) {
    return extensionError(
      origin,
      "Assign a counsellor before setting Counselling In-Progress",
      400,
      "bad_request",
    );
  }

  const { data: created, error: createError } = await supabase
    .from("leads")
    .insert({
      full_name: fullName,
      phone,
      phone_key: phoneKey,
      interested_course: interestedCourse,
      college_id: collegeId,
      source: "direct_calls_whatsapp",
      status,
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

  // Starting counselling is not just a column value. The CRM seeds the
  // follow-up schedule and records the audit event that the counselling and
  // user-audit reports are built from, so creating a lead directly in this
  // status has to do the same or those reports quietly lose the lead.
  if (status === "counselling_in_progress" && assignedCounsellor) {
    const { error: seedError } = await supabase.rpc("start_counselling_follow_ups", {
      p_lead_id: lead.id,
      p_assigned_user_id: assignedCounsellor,
      p_first_at: new Date().toISOString(),
    });
    if (seedError) {
      // The lead exists and is correct; only the schedule is missing, so this
      // is reported rather than left silent — and never rolled back.
      console.error("[Extension] Follow-up seeding failed:", seedError.message);
    }

    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      user_id: profile.id,
      type: "status_change",
      title: `Status changed to ${status}`,
      description: "Set when the lead was captured from WhatsApp Web.",
    });
    await supabase.from("user_audit_events").insert({
      user_id: profile.id,
      event_type: "counselling_started",
      lead_id: lead.id,
    });
  }

  await supabase.from("user_audit_events").insert({
    user_id: profile.id,
    event_type: "lead_created",
    lead_id: lead.id,
    metadata: { college_id: collegeId, interested_course: interestedCourse },
  });

  return extensionJson(
    origin,
    { created: true, duplicate: false, phone_key: phoneKey, lead, other_lead_count: 0 },
    201,
  );
}
