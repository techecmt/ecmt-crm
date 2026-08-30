import {
  authenticateExtensionRequest,
  canWriteLeads,
  extensionError,
  extensionJson,
  getRequestOrigin,
  handleExtensionPreflight,
} from "@/lib/extension/api";
import { extensionStatusOptions } from "@/lib/extension/leads";
import { createClient } from "@/lib/supabase/server";
import { isAssignableCounsellor, type UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}

type CollegeRow = { id: string; name: string; courses: string[] | null };
type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  is_active: boolean;
};

/**
 * Options for the extension's create-lead form: colleges with their courses,
 * assignable counsellors, and the statuses valid at first contact.
 *
 * Served from the CRM rather than hard-coded in the extension so the dropdowns
 * always reflect the live college/course catalogue and role model.
 */
export async function GET(request: Request) {
  const origin = getRequestOrigin(request);
  const { profile, response } = await authenticateExtensionRequest(origin, "read");
  if (!profile) return response;

  const supabase = await createClient();

  const [collegesResult, profilesResult] = await Promise.all([
    supabase
      .from("colleges")
      .select("id, name, courses")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  if (collegesResult.error) {
    console.error("[Extension] College lookup failed:", collegesResult.error.message);
    return extensionError(origin, "Unable to load colleges", 500, "server_error");
  }
  if (profilesResult.error) {
    console.error("[Extension] Counsellor lookup failed:", profilesResult.error.message);
    return extensionError(origin, "Unable to load counsellors", 500, "server_error");
  }

  const colleges = ((collegesResult.data ?? []) as CollegeRow[]).map((college) => ({
    id: college.id,
    name: college.name,
    // De-duplicated and trimmed, matching how the CRM's lead form derives them.
    courses: Array.from(
      new Set((college.courses ?? []).map((course) => course.trim()).filter(Boolean)),
    ),
  }));

  const counsellors = ((profilesResult.data ?? []) as ProfileRow[])
    .filter((candidate) => isAssignableCounsellor(candidate))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.full_name || candidate.email,
    }));

  return extensionJson(origin, {
    colleges,
    counsellors,
    statuses: extensionStatusOptions(),
    current_user_id: profile.id,
    // A read-only role still gets the form data, but the panel hides the form.
    can_write_leads: canWriteLeads(profile),
  });
}
