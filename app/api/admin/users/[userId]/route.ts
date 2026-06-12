import { NextResponse } from "next/server";

import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  APP_MODULE_LABELS,
  USER_ROLE_LABELS,
  type AppModule,
  type UserRole,
} from "@/lib/types";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && value in USER_ROLE_LABELS;
}

function isAppModule(value: unknown): value is AppModule {
  return typeof value === "string" && value in APP_MODULE_LABELS;
}

function parseModulePermissions(
  value: unknown,
): { ok: true; value: AppModule[] | null } | { ok: false } {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (!Array.isArray(value)) {
    return { ok: false };
  }
  if (!value.every(isAppModule)) {
    return { ok: false };
  }
  return { ok: true, value: Array.from(new Set(value)) };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (!hasModuleAccess(profile, "users")) return forbidden();
  if (profile.role !== "super_admin") return forbidden();

  const { userId } = await params;

  let body: {
    full_name?: string;
    auth_enabled?: boolean;
    role?: unknown;
    module_permissions?: unknown;
  } = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as typeof body;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (typeof body.full_name === "string") {
    const fullName = body.full_name.trim();
    if (!fullName) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const { error } = await admin
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if (typeof body.auth_enabled === "boolean") {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: body.auth_enabled ? "none" : "876000h",
    });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ is_active: body.auth_enabled })
      .eq("id", userId);
    if (profileError) {
      // Best-effort rollback to avoid auth/profile divergence.
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: body.auth_enabled ? "876000h" : "none",
      });
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
  }

  if ("role" in body) {
    if (!isUserRole(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const { error } = await admin
      .from("profiles")
      .update({ role: body.role })
      .eq("id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if ("module_permissions" in body) {
    const parsed = parseModulePermissions(body.module_permissions);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "module_permissions must be null or an array of valid modules" },
        { status: 400 },
      );
    }
    const { error } = await admin
      .from("profiles")
      .update({ module_permissions: parsed.value })
      .eq("id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (!hasModuleAccess(profile, "users")) return forbidden();
  if (profile.role !== "super_admin") return forbidden();

  const { userId } = await params;
  if (userId === profile.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Cleanup for projects without cascading delete from auth users.
  await admin.from("profiles").delete().eq("id", userId);

  return NextResponse.json({ ok: true });
}
