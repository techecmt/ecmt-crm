import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppModule, UserRole } from "@/lib/types";
import { isAdminRole } from "@/lib/types";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    email?: string;
    full_name?: string;
    role?: UserRole;
    module_permissions?: AppModule[] | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const role = body.role ?? "staff_viewer";
  const fullName = body.full_name?.trim() || email.split("@")[0];
  const modulePermissions = body.module_permissions ?? null;

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
