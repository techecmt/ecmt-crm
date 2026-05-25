import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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

  // Get conversation to find the phone number
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("phone")
    .eq("id", id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Send via WhatsApp
  try {
    await sendWhatsAppMessage(conversation.phone, message.trim());
  } catch (err) {
    console.error("[API] Failed to send WhatsApp message:", err);
    return NextResponse.json(
      { error: "Failed to send WhatsApp message" },
      { status: 502 }
    );
  }

  // Store in DB
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    content: message.trim(),
  });

  if (insertError) {
    console.error("[API] Failed to store message:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
