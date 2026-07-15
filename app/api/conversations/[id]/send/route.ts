import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { sendMessage } from "@/lib/messaging/send";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { message } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get conversation channel target.
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("channel, external_user_id, page_id")
    .eq("id", id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Send via channel router.
  try {
    await sendMessage(conversation, message.trim());
  } catch (err) {
    console.error("[API] Failed to send message:", err);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 502 }
    );
  }

  // Store in DB
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    content: message.trim(),
    sent_by_user_id: user?.id ?? null,
  });

  if (insertError) {
    console.error("[API] Failed to store message:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const updatedAt = new Date().toISOString();
  if (conversation.channel === "website") {
    // The first human reply claims the website conversation and stops bot replies.
    const { data: claimed } = await supabase
      .from("conversations")
      .update({
        assigned_user_id: profile.id,
        lifecycle_status: "human_handled",
        bot_enabled: false,
        mode: "human",
        updated_at: updatedAt,
      })
      .eq("id", id)
      .is("assigned_user_id", null)
      .select("id");

    // Preserve a deliberate existing assignee while still recording the takeover.
    if (!claimed?.length) {
      await supabase
        .from("conversations")
        .update({
          lifecycle_status: "human_handled",
          bot_enabled: false,
          mode: "human",
          updated_at: updatedAt,
        })
        .eq("id", id);
    }
  } else {
    await supabase
      .from("conversations")
      .update({ updated_at: updatedAt })
      .eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
