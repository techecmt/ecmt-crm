import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const channel = searchParams.get("channel");
  const pageId = searchParams.get("page_id");
  const status = searchParams.get("status");
  const assignedUserId = searchParams.get("assigned_user_id");
  const mode = searchParams.get("mode");

  let query = supabase
    .from("conversations")
    .select(
      `
      id,
      channel,
      page_id,
      external_user_id,
      phone,
      name,
      status,
      assigned_user_id,
      mode,
      lead_id,
      lifecycle_status,
      bot_enabled,
      visitor_data,
      source_url,
      updated_at,
      created_at,
      messages (
        content,
        role,
        created_at
      )
    `
    )
    .order("updated_at", { ascending: false })
    .order("created_at", {
      referencedTable: "messages",
      ascending: false,
    })
    .limit(1, { referencedTable: "messages" });

  if (channel && channel !== "all") query = query.eq("channel", channel);
  if (status && status !== "all") query = query.eq("status", status);
  if (mode && mode !== "all") query = query.eq("mode", mode);
  if (pageId && pageId !== "all") query = query.eq("page_id", pageId);

  if (assignedUserId === "unassigned") {
    query = query.is("assigned_user_id", null);
  } else if (assignedUserId && assignedUserId !== "all") {
    query = query.eq("assigned_user_id", assignedUserId);
  }

  if (profile.role === "counsellor") {
    // Unassigned chats remain visible so a counsellor can claim a visitor-requested handoff.
    query = query.or(`assigned_user_id.eq.${profile.id},assigned_user_id.is.null`);
  }

  const { data: conversations, error } = await query;

  if (error) {
    console.error("[API] Failed to fetch conversations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const formatted = (conversations || []).map((c) => ({
    id: c.id,
    channel: c.channel,
    page_id: c.page_id,
    external_user_id: c.external_user_id,
    phone: c.phone,
    name: c.name,
    status: c.status,
    assigned_user_id: c.assigned_user_id,
    mode: c.mode,
    lead_id: c.lead_id,
    lifecycle_status: c.lifecycle_status,
    bot_enabled: c.bot_enabled ?? true,
    visitor_data: c.visitor_data ?? null,
    source_url: c.source_url ?? null,
    updated_at: c.updated_at,
    created_at: c.created_at,
    last_message: c.messages?.[0] || null,
  }));

  return NextResponse.json(formatted);
}
