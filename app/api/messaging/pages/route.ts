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
  if (!isAdminRole(profile.role)) {
    return forbidden();
  }

  const agentId = request.nextUrl.searchParams.get("agent_id");
  const supabase = await createClient();
  let query = supabase
    .from("messaging_pages")
    .select(
      "id, agent_id, name, page_id, phone_number_id, channel, is_active, description, last_verified_at, created_at, updated_at",
    )
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
  if (!hasModuleAccess(profile, "message_centre")) {
    return forbidden();
  }
  if (!isAdminRole(profile.role)) {
    return forbidden();
  }

  const body = (await request.json()) as {
    agent_id?: string;
    name?: string;
    page_id?: string;
    access_token?: string;
    channel?: "messenger" | "whatsapp";
    phone_number_id?: string;
    description?: string;
    is_active?: boolean;
  };

  if (!body.name?.trim() || !body.page_id?.trim() || !body.access_token?.trim()) {
    return NextResponse.json(
      { error: "name, page_id and access_token are required" },
      { status: 400 },
    );
  }
  if (!body.agent_id) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const channel = body.channel ?? "messenger";
  if (channel === "whatsapp" && !body.phone_number_id?.trim()) {
    return NextResponse.json(
      { error: "phone_number_id is required for WhatsApp connections" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messaging_pages")
    .insert({
      agent_id: body.agent_id,
      name: body.name.trim(),
      page_id: body.page_id.trim(),
      access_token: body.access_token.trim(),
      channel,
      phone_number_id: body.phone_number_id?.trim() || null,
      description: body.description?.trim() || "",
      is_active: body.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, agent_id, name, page_id, phone_number_id, channel, is_active, description, last_verified_at, created_at, updated_at",
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

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

  const body = (await request.json()) as {
    id: string;
    agent_id?: string;
    name?: string;
    page_id?: string;
    access_token?: string;
    phone_number_id?: string;
    description?: string;
    is_active?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.agent_id === "string") updates.agent_id = body.agent_id;
  if (typeof body.page_id === "string") updates.page_id = body.page_id.trim();
  if (typeof body.access_token === "string") updates.access_token = body.access_token.trim();
  if (typeof body.phone_number_id === "string")
    updates.phone_number_id = body.phone_number_id.trim() || null;
  if (typeof body.description === "string") updates.description = body.description.trim();
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  const supabase = await createClient();
  const { error } = await supabase
    .from("messaging_pages")
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
  if (!hasModuleAccess(profile, "message_centre")) {
    return forbidden();
  }
  if (!isAdminRole(profile.role)) {
    return forbidden();
  }

  const { id } = (await request.json()) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("messaging_pages").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
