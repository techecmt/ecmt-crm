import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listApprovedTwilioWhatsAppTemplates } from "@/lib/messaging/twilio";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const conversationId = request.nextUrl.searchParams.get("conversation_id");

  let twilioConnectionId: string | null = null;
  if (conversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("channel, provider, twilio_connection_id")
      .eq("id", conversationId)
      .single();
    if (conversationError || !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (conversation.channel !== "whatsapp" || conversation.provider !== "twilio") {
      return NextResponse.json(
        { error: "Templates are available only for Twilio WhatsApp conversations" },
        { status: 400 },
      );
    }
    twilioConnectionId = conversation.twilio_connection_id ?? null;
  }

  let connection:
    | {
        account_sid: string;
        auth_token: string;
        whatsapp_from: string | null;
        messaging_service_sid: string | null;
      }
    | null = null;
  if (twilioConnectionId) {
    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("twilio_connections")
      .select("account_sid, auth_token, whatsapp_from, messaging_service_sid")
      .eq("id", twilioConnectionId)
      .single();
    if (error || !row) {
      return NextResponse.json(
        { error: "Twilio connection not found for this conversation" },
        { status: 404 },
      );
    }
    connection = row;
  }

  try {
    const templates = await listApprovedTwilioWhatsAppTemplates(connection ?? undefined);
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[API] Failed to load Twilio templates:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Twilio templates",
      },
      { status: 502 },
    );
  }
}
