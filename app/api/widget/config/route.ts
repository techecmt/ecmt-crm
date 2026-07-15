import { NextRequest, NextResponse } from "next/server";

import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireWidgetAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Unauthorized", status: 401 } as const;
  if (!hasModuleAccess(profile, "message_centre") || !isAdminRole(profile.role)) {
    return { error: "Forbidden", status: 403 } as const;
  }
  return { profile } as const;
}

function normalizeOrigins(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Add at least one allowed website origin");
  }

  return [...new Set(value.map((entry) => {
    if (typeof entry !== "string") throw new Error("Each allowed origin must be text");
    const origin = new URL(entry.trim()).origin;
    if (!/^https?:\/\//.test(origin)) throw new Error("Allowed origins must use HTTP or HTTPS");
    return origin;
  }))];
}

export async function GET() {
  const auth = await requireWidgetAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("website_widget_config")
    .select("public_key, allowed_origins, is_active")
    .eq("id", true)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireWidgetAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      allowed_origins?: unknown;
      is_active?: unknown;
    };
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.allowed_origins !== undefined) {
      updates.allowed_origins = normalizeOrigins(body.allowed_origins);
    }
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("website_widget_config")
      .update(updates)
      .eq("id", true)
      .select("public_key, allowed_origins, is_active")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid widget configuration" },
      { status: 400 },
    );
  }
}
