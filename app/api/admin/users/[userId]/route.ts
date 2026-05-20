import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (profile.role !== "super_admin") return forbidden();

  const { userId } = await params;

  let body: { full_name?: string; auth_enabled?: boolean } = {};
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
      return NextResponse.json({ error: profileError.message }, { status: 400 });
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
