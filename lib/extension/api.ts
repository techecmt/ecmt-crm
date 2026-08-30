import "server-only";

import { NextResponse } from "next/server";

import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import type { AppModule, Profile } from "@/lib/types";

/**
 * Shared plumbing for the WhatsApp Web companion extension endpoints.
 *
 * Authentication reuses the counsellor's existing ECMT browser session: the
 * extension calls these routes with `credentials: "include"`, so the Supabase
 * auth cookie set on the CRM origin is what identifies the user. There is no
 * extension-specific credential to leak, and `getCurrentProfile()` already
 * rejects inactive profiles.
 *
 * Module policy (applied consistently across every extension endpoint):
 * - Reading   (session, lead lookup)          requires the `leads` module.
 * - Writing   (create lead, import messages)  requires the `leads` module AND a
 *   role that is not `staff_viewer`, which is read-only by definition.
 */

/** Module gating every extension endpoint. Imported chats surface on the lead's Messages tab. */
export const EXTENSION_MODULE: AppModule = "leads";

/** Roles that may only look, never write, from the extension. */
const READ_ONLY_ROLES: ReadonlyArray<Profile["role"]> = ["staff_viewer"];

export function canWriteLeads(profile: Profile): boolean {
  return (
    hasModuleAccess(profile, EXTENSION_MODULE) &&
    !READ_ONLY_ROLES.includes(profile.role)
  );
}

export type ExtensionAuthFailure = { profile: null; response: NextResponse };
export type ExtensionAuthSuccess = { profile: Profile; response: null };
export type ExtensionAuthResult = ExtensionAuthSuccess | ExtensionAuthFailure;

/**
 * Resolve the calling counsellor from the CRM session cookie.
 *
 * `mode: "write"` additionally rejects read-only roles. Returns a ready-made
 * error response instead of throwing so callers stay linear and always get the
 * CORS headers applied on the way out.
 */
export async function authenticateExtensionRequest(
  origin: string | null,
  mode: "read" | "write" = "read",
): Promise<ExtensionAuthResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      profile: null,
      response: extensionError(origin, "Not signed in to ECMT CRM", 401, "unauthenticated"),
    };
  }
  if (!hasModuleAccess(profile, EXTENSION_MODULE)) {
    return {
      profile: null,
      response: extensionError(
        origin,
        "Your ECMT account cannot use this extension",
        403,
        "forbidden",
      ),
    };
  }
  if (mode === "write" && !canWriteLeads(profile)) {
    return {
      profile: null,
      response: extensionError(
        origin,
        "Your ECMT role is read-only and cannot create leads or import chats",
        403,
        "read_only",
      ),
    };
  }

  return { profile, response: null };
}

export type ExtensionErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "read_only"
  | "bad_request"
  | "not_found"
  | "server_error";

export function extensionError(
  origin: string | null,
  message: string,
  status: number,
  code: ExtensionErrorCode,
): NextResponse {
  return applyExtensionCors(
    NextResponse.json({ error: message, code }, { status }),
    origin,
  );
}

export function extensionJson<T>(
  origin: string | null,
  body: T,
  status = 200,
): NextResponse {
  return applyExtensionCors(NextResponse.json(body, { status }), origin);
}

/* -------------------------------------------------------------------------- */
/*  CORS — scoped to /api/extension/* and to extension origins only.           */
/* -------------------------------------------------------------------------- */

const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/**
 * Allowed extension origins.
 *
 * Set `EXTENSION_ALLOWED_ORIGINS` to a comma-separated list of
 * `chrome-extension://<id>` origins in production. Outside production, any
 * well-formed chrome-extension origin is accepted so an unpacked build (whose
 * id changes per machine) works without configuration. This is a convenience
 * only — CORS is not what protects these routes; the session cookie is.
 */
function isAllowedExtensionOrigin(origin: string): boolean {
  const configured = (process.env.EXTENSION_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured.includes(origin);
  if (process.env.NODE_ENV === "production") return false;
  return CHROME_EXTENSION_ORIGIN.test(origin);
}

/** Echo the request origin when it is an allowed extension, else send no CORS headers. */
export function applyExtensionCors(
  response: NextResponse,
  origin: string | null,
): NextResponse {
  if (!origin || !isAllowedExtensionOrigin(origin)) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  // Required: the extension sends the CRM session cookie with every request.
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.set("Vary", "Origin");
  return response;
}

export function getRequestOrigin(request: Request): string | null {
  return request.headers.get("origin");
}

/** Shared OPTIONS handler for every /api/extension route. */
export function handleExtensionPreflight(request: Request): NextResponse {
  return applyExtensionCors(
    new NextResponse(null, { status: 204 }),
    getRequestOrigin(request),
  );
}
