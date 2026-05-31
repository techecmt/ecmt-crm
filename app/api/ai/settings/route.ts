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

const ALLOWED_FIELDS = [
  "system_prompt",
  "model",
  "temperature",
  "max_tokens",
  "agent_name",
  "persona",
  "tone",
  "greeting_message",
  "fallback_message",
  "escalation_enabled",
  "escalation_keywords",
  "escalation_message",
  "auto_collect_lead",
  "lead_collect_fields",
  "business_hours_enabled",
  "business_hours",
  "offline_message",
  "response_delay_ms",
  "max_history_messages",
  "is_active",
] as const;

export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_settings")
    .update(updates)
    .eq("id", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
