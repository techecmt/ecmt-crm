import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function validateTwilioSender(input: {
  whatsapp_from?: string | null;
  messaging_service_sid?: string | null;
}) {
  const hasSender = Boolean(input.whatsapp_from?.trim());
  const hasService = Boolean(input.messaging_service_sid?.trim());
  return hasSender || hasService;
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const agentId = request.nextUrl.searchParams.get("agent_id");
  const supabase = await createClient();
  let query = supabase
    .from("twilio_connections")
    .select("*")
    .order("created_at", { ascending: true });
  if (agentId) query = query.eq("agent_id", agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const body = (await request.json()) as {
    agent_id?: string;
    name?: string;
    account_sid?: string;
    auth_token?: string;
    whatsapp_from?: string;
    messaging_service_sid?: string;
    description?: string;
    is_active?: boolean;
  };

  if (!body.agent_id || !body.name?.trim()) {
    return NextResponse.json({ error: "agent_id and name are required" }, { status: 400 });
  }
  if (!body.account_sid?.trim() || !body.auth_token?.trim()) {
    return NextResponse.json(
      { error: "account_sid and auth_token are required" },
      { status: 400 },
    );
  }
  if (!validateTwilioSender(body)) {
    return NextResponse.json(
      { error: "Provide whatsapp_from or messaging_service_sid" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("twilio_connections")
    .insert({
      agent_id: body.agent_id,
      name: body.name.trim(),
      account_sid: body.account_sid.trim(),
      auth_token: body.auth_token.trim(),
      whatsapp_from: body.whatsapp_from?.trim() || null,
      messaging_service_sid: body.messaging_service_sid?.trim() || null,
      description: body.description?.trim() || "",
      is_active: body.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const body = (await request.json()) as {
    id?: string;
    agent_id?: string;
    name?: string;
    account_sid?: string;
    auth_token?: string;
    whatsapp_from?: string;
    messaging_service_sid?: string;
    description?: string;
    is_active?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.agent_id === "string") updates.agent_id = body.agent_id;
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.account_sid === "string") updates.account_sid = body.account_sid.trim();
  if (typeof body.auth_token === "string") updates.auth_token = body.auth_token.trim();
  if (typeof body.whatsapp_from === "string") {
    updates.whatsapp_from = body.whatsapp_from.trim() || null;
  }
  if (typeof body.messaging_service_sid === "string") {
    updates.messaging_service_sid = body.messaging_service_sid.trim() || null;
  }
  if (typeof body.description === "string") updates.description = body.description.trim();
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("twilio_connections")
    .select("whatsapp_from,messaging_service_sid")
    .eq("id", body.id)
    .single();
  if (currentError || !current) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const nextSender = {
    whatsapp_from:
      (updates.whatsapp_from as string | null | undefined) ?? current.whatsapp_from,
    messaging_service_sid:
      (updates.messaging_service_sid as string | null | undefined) ??
      current.messaging_service_sid,
  };
  if (!validateTwilioSender(nextSender)) {
    return NextResponse.json(
      { error: "Provide whatsapp_from or messaging_service_sid" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("twilio_connections")
    .update(updates)
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("twilio_connections").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
