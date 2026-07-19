import { NextResponse } from "next/server";

import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "leads")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: leadId } = await params;
  const supabase = await createClient();
  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, channel, external_user_id, name, created_at, updated_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (conversationsError) {
    return NextResponse.json({ error: conversationsError.message }, { status: 500 });
  }

  const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
  if (!conversationIds.length) {
    return NextResponse.json([]);
  }

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, role, content, sent_by_user_id, created_at, sender:profiles!messages_sent_by_user_id_fkey(full_name, email)",
    )
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  const messagesByConversation = new Map<string, NonNullable<typeof messages>>();
  for (const message of messages ?? []) {
    const existing = messagesByConversation.get(message.conversation_id) ?? [];
    existing.push(message);
    messagesByConversation.set(message.conversation_id, existing);
  }

  return NextResponse.json(
    (conversations ?? []).map((conversation) => ({
      ...conversation,
      messages: messagesByConversation.get(conversation.id) ?? [],
    })),
  );
}
