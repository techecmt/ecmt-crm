import { canWriteLeads, extensionJson, getRequestOrigin, handleExtensionPreflight } from "@/lib/extension/api";
import { authenticateExtensionRequest } from "@/lib/extension/api";
import { USER_ROLE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}

/** Whoami / connection status for the extension panel. */
export async function GET(request: Request) {
  const origin = getRequestOrigin(request);
  const { profile, response } = await authenticateExtensionRequest(origin, "read");
  if (!profile) return response;

  return extensionJson(origin, {
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      role_label: USER_ROLE_LABELS[profile.role],
    },
    permissions: {
      can_read_leads: true,
      can_write_leads: canWriteLeads(profile),
    },
  });
}
