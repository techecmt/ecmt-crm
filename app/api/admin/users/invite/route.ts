import { NextResponse } from "next/server";

import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  APP_MODULE_LABELS,
  DEFAULT_MODULES,
  USER_ROLE_LABELS,
  isAdminRole,
  type AppModule,
  type UserRole,
} from "@/lib/types";

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && value in USER_ROLE_LABELS;
}

function isAppModule(value: unknown): value is AppModule {
  return typeof value === "string" && value in APP_MODULE_LABELS;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasModuleAccess(profile, "users")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    email?: unknown;
    full_name?: unknown;
    role?: unknown;
    module_permissions?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const requestedRole = body.role === undefined ? "staff_viewer" : body.role;
  if (!isUserRole(requestedRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const role: UserRole = requestedRole;
  if (role === "super_admin" && profile.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only Super Admin can invite another Super Admin" },
      { status: 403 },
    );
  }

  const fullName =
    typeof body.full_name === "string" && body.full_name.trim()
      ? body.full_name.trim()
      : email.split("@")[0];

  let modulePermissions: AppModule[] | null = null;
  if (!isAdminRole(role)) {
    if (body.module_permissions === undefined) {
      modulePermissions = [...DEFAULT_MODULES];
    } else if (body.module_permissions === null) {
      modulePermissions = [];
    } else if (Array.isArray(body.module_permissions) && body.module_permissions.every(isAppModule)) {
      modulePermissions = Array.from(new Set(body.module_permissions));
    } else {
      return NextResponse.json(
        { error: "module_permissions must be an array of valid modules for non-admin roles" },
        { status: 400 },
      );
    }
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role,
      module_permissions: modulePermissions,
    },
    redirectTo: `${request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || ""}/auth/confirm?next=/dashboard`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, user_id: data.user.id });
}
