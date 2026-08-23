import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agents")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const body = (await request.json()) as {
    name?: string;
    persona?: string;
    system_prompt?: string;
    tone?: "professional_friendly" | "formal" | "casual" | "empathetic";
    model?: string;
    temperature?: number;
    max_tokens?: number;
    max_history_messages?: number;
    response_delay_ms?: number;
    greeting_message?: string;
    fallback_message?: string;
    escalation_enabled?: boolean;
    escalation_keywords?: string[];
    escalation_message?: string;
    auto_collect_lead?: boolean;
    lead_collect_fields?: string[];
    business_hours_enabled?: boolean;
    business_hours?: {
      timezone: string;
      days: Record<string, { start: string; end: string }>;
    };
    offline_message?: string;
    is_active?: boolean;
    is_default?: boolean;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = await createClient();
  if (body.is_default === true) {
    await supabase.from("ai_agents").update({ is_default: false }).eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("ai_agents")
    .insert({
      name: body.name.trim(),
      persona: body.persona?.trim() || "",
      system_prompt: body.system_prompt?.trim() || "",
      tone: body.tone || "professional_friendly",
      model: body.model?.trim() || "openai/gpt-4o-mini",
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 500,
      max_history_messages: body.max_history_messages ?? 20,
      response_delay_ms: body.response_delay_ms ?? 0,
      greeting_message: body.greeting_message?.trim() || "",
      fallback_message: body.fallback_message?.trim() || "",
      escalation_enabled: body.escalation_enabled ?? true,
      escalation_keywords: body.escalation_keywords ?? [],
      escalation_message: body.escalation_message?.trim() || "",
      auto_collect_lead: body.auto_collect_lead ?? false,
      lead_collect_fields: body.lead_collect_fields ?? ["name", "phone", "email", "course"],
      business_hours_enabled: body.business_hours_enabled ?? false,
      business_hours: body.business_hours ?? { timezone: "Asia/Singapore", days: {} },
      offline_message: body.offline_message?.trim() || "",
      is_active: body.is_active ?? true,
      is_default: body.is_default ?? false,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "persona",
  "system_prompt",
  "tone",
  "model",
  "temperature",
  "max_tokens",
  "max_history_messages",
  "response_delay_ms",
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
  "is_active",
  "is_default",
] as const;

export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const body = (await request.json()) as Record<string, unknown> & { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (typeof updates.name === "string") {
    updates.name = updates.name.trim();
    if (!updates.name) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
  }

  if (typeof updates.persona === "string") updates.persona = updates.persona.trim();
  if (typeof updates.system_prompt === "string") {
    updates.system_prompt = updates.system_prompt.trim();
  }
  if (typeof updates.model === "string") updates.model = updates.model.trim();
  if (typeof updates.greeting_message === "string") {
    updates.greeting_message = updates.greeting_message.trim();
  }
  if (typeof updates.fallback_message === "string") {
    updates.fallback_message = updates.fallback_message.trim();
  }
  if (typeof updates.escalation_message === "string") {
    updates.escalation_message = updates.escalation_message.trim();
  }
  if (typeof updates.offline_message === "string") {
    updates.offline_message = updates.offline_message.trim();
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = await createClient();

  if (updates.is_default === true) {
    await supabase.from("ai_agents").update({ is_default: false }).eq("is_default", true);
  }

  if (updates.is_default === false) {
    delete updates.is_default;
  }

  const { error } = await supabase.from("ai_agents").update(updates).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return unauthorized();
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("ai_agents")
    .select("id, is_default")
    .eq("id", id)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (target.is_default) {
    return NextResponse.json({ error: "Cannot delete the default agent" }, { status: 400 });
  }

  const { count } = await supabase
    .from("ai_agents")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "At least one AI agent is required" }, { status: 400 });
  }

  const { error } = await supabase.from("ai_agents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
