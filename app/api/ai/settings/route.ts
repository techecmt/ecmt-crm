import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return forbidden();
  }

  const agentId = request.nextUrl.searchParams.get("agent_id");
  const supabase = await createClient();
  let query = supabase.from("ai_agents").select("*");
  if (agentId) {
    query = query.eq("id", agentId);
  } else {
    query = query.eq("is_default", true);
  }

  let { data, error } = await query.single();
  if (!agentId && (!data || error)) {
    const fallback = await supabase
      .from("ai_agents")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const ALLOWED_FIELDS = [
  "system_prompt",
  "model",
  "temperature",
  "max_tokens",
  "name",
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
  "is_default",
] as const;

export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return forbidden();
  }
  if (!isAdminRole(profile.role)) {
    return forbidden();
  }

  const body = (await request.json()) as Record<string, unknown> & { agent_id?: string };
  const agentId =
    typeof body.agent_id === "string" ? body.agent_id : request.nextUrl.searchParams.get("agent_id");
  if (!agentId) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const supabase = await createClient();
  if (body.is_default === true) {
    await supabase.from("ai_agents").update({ is_default: false }).eq("is_default", true);
  }
  if (body.is_default === false) {
    delete updates.is_default;
  }

  const { error } = await supabase
    .from("ai_agents")
    .update(updates)
    .eq("id", agentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
