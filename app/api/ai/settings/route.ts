import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    system_prompt?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.system_prompt === "string") updates.system_prompt = body.system_prompt;
  if (typeof body.model === "string") updates.model = body.model;
  if (typeof body.temperature === "number") updates.temperature = body.temperature;
  if (typeof body.max_tokens === "number") updates.max_tokens = body.max_tokens;

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_settings")
    .update(updates)
    .eq("id", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
