import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

type UpdateCourseBody = {
  course_name?: unknown;
  fee_summary?: unknown;
  fee_details?: unknown;
  fee_amount?: unknown;
  fee_currency?: unknown;
  keyword_aliases?: unknown;
  is_active?: unknown;
  sort_order?: unknown;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const { id } = await params;
  const body = (await request.json()) as UpdateCourseBody;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.course_name === "string") {
    const value = body.course_name.trim();
    if (!value) {
      return NextResponse.json(
        { error: "course_name cannot be empty" },
        { status: 400 },
      );
    }
    updates.course_name = value;
  }
  if (typeof body.fee_summary === "string") updates.fee_summary = body.fee_summary.trim();
  if (typeof body.fee_details === "string") updates.fee_details = body.fee_details.trim();
  if (typeof body.fee_currency === "string") {
    updates.fee_currency = body.fee_currency.trim().toUpperCase() || "SGD";
  }
  if (body.fee_amount === null) {
    updates.fee_amount = null;
  } else if (typeof body.fee_amount === "number" && Number.isFinite(body.fee_amount)) {
    updates.fee_amount = body.fee_amount;
  }
  if (Array.isArray(body.keyword_aliases)) {
    updates.keyword_aliases = body.keyword_aliases
      .map((alias) => (typeof alias === "string" ? alias.trim() : ""))
      .filter(Boolean);
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order)) {
    updates.sort_order = body.sort_order;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_course_catalog")
    .update(updates)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("ai_course_catalog").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
