import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (body.mode && ["agent", "human"].includes(body.mode)) {
    updates.mode = body.mode;
  }

  if (body.lead_id !== undefined) {
    updates.lead_id = body.lead_id;
  }

  if (
    body.status &&
    ["open", "pending", "resolved", "spam"].includes(body.status)
  ) {
    updates.status = body.status;
  }

  if (body.assigned_user_id !== undefined) {
    updates.assigned_user_id = body.assigned_user_id || null;
  }

  if (body.phone !== undefined) {
    updates.phone = body.phone || null;
  }

  if (body.read_state === "read") {
    updates.unread_count = 0;
  } else if (body.read_state === "unread") {
    updates.unread_count = 1;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: before } = await supabase
    .from("conversations")
    .select("lead_id, status, assigned_user_id, channel")
    .eq("id", id)
    .single();

  if (before?.channel === "website" && updates.status === "resolved") {
    updates.lifecycle_status = "closed";
    updates.bot_enabled = false;
  }

  const { data: updatedConversation, error } = await supabase
    .from("conversations")
    .update(updates)
    .select("id, lead_id, status, assigned_user_id")
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const current = updatedConversation?.[0];
  if (!current) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (current.lead_id && before?.status !== current.status && updates.status) {
    await supabase.from("lead_activities").insert({
      lead_id: current.lead_id,
      user_id: profile.id,
      type: "status_change",
      title: `Conversation status changed to ${current.status}`,
    });
  }

  if (
    current.lead_id &&
    before?.assigned_user_id !== current.assigned_user_id &&
    updates.assigned_user_id !== undefined
  ) {
    await supabase.from("lead_activities").insert({
      lead_id: current.lead_id,
      user_id: profile.id,
      type: "assignment",
      title: current.assigned_user_id
        ? "Conversation assigned"
        : "Conversation unassigned",
      description: current.assigned_user_id
        ? "Chat assignment updated from Message Centre."
        : "Chat is now unassigned.",
    });

    await supabase
      .from("leads")
      .update({ assigned_counsellor: current.assigned_user_id })
      .eq("id", current.lead_id);
  }

  return NextResponse.json({ ok: true });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("*, leads(id, full_name, phone, status, source, assigned_counsellor)")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}
