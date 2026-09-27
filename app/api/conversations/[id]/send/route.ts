import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { sendMessage } from "@/lib/messaging/send";
import {
  MESSAGE_MEDIA_BUCKET,
  classifyWhatsAppMedia,
} from "@/lib/messaging/media";
import { sendTwilioWhatsAppTemplate } from "@/lib/messaging/twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OutboundMediaInput } from "@/lib/messaging/send";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const mediaRaw =
    body.media && typeof body.media === "object"
      ? (body.media as Record<string, unknown>)
      : null;
  const mediaType: "image" | "document" | null =
    mediaRaw?.type === "image"
      ? "image"
      : mediaRaw?.type === "document"
        ? "document"
        : null;
  const mediaRef =
    mediaRaw &&
    typeof mediaRaw.bucket === "string" &&
    typeof mediaRaw.path === "string" &&
    mediaType
      ? {
          bucket: mediaRaw.bucket.trim(),
          path: mediaRaw.path.trim(),
          type: mediaType,
          mimeType:
            typeof mediaRaw.mimeType === "string" ? mediaRaw.mimeType.trim().toLowerCase() : "",
          filename:
            typeof mediaRaw.filename === "string" && mediaRaw.filename.trim()
              ? mediaRaw.filename.trim()
              : null,
        }
      : null;
  const template = body.template as
    | {
        content_sid?: unknown;
        variables?: unknown;
      }
    | undefined;
  const contentSid =
    typeof template?.content_sid === "string" ? template.content_sid.trim() : "";

  if (!message && !contentSid && !mediaRef) {
    return NextResponse.json(
      { error: "Message, media, or template is required" },
      { status: 400 },
    );
  }
  if (contentSid && mediaRef) {
    return NextResponse.json(
      { error: "Template and media cannot be sent in the same request" },
      { status: 400 },
    );
  }
  if (mediaRef?.bucket && mediaRef.bucket !== MESSAGE_MEDIA_BUCKET) {
    return NextResponse.json({ error: "Invalid media bucket" }, { status: 400 });
  }
  if (mediaRef?.path && !mediaRef.path.startsWith(`${id}/`)) {
    return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
  }
  if (mediaRef) {
    const classified = classifyWhatsAppMedia({
      mimeType: mediaRef.mimeType,
      filename: mediaRef.filename,
    });
    if (!classified || classified.type !== mediaRef.type) {
      return NextResponse.json(
        { error: "Unsupported media type. Allowed: JPG, JPEG, PNG, WEBP, PDF." },
        { status: 400 },
      );
    }
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
    .select("channel, provider, external_user_id, page_id, twilio_connection_id")
    .eq("id", id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  let media: (OutboundMediaInput & { mimeType: string | null }) | null = null;
  if (mediaRef) {
    const admin = createAdminClient();
    const { data } = admin.storage.from(MESSAGE_MEDIA_BUCKET).getPublicUrl(mediaRef.path);
    media = {
      type: mediaRef.type,
      url: data.publicUrl,
      filename: mediaRef.filename,
      mimeType: mediaRef.mimeType || null,
    };
  }

  try {
    if (contentSid) {
      if (
        conversation.channel !== "whatsapp" ||
        conversation.provider !== "twilio"
      ) {
        return NextResponse.json(
          { error: "Twilio templates can only be sent to Twilio WhatsApp conversations" },
          { status: 400 },
        );
      }
      if (!/^HX[a-fA-F0-9]{32}$/.test(contentSid)) {
        return NextResponse.json({ error: "Invalid Twilio Content SID" }, { status: 400 });
      }

      const variables =
        template?.variables && typeof template.variables === "object"
          ? Object.entries(template.variables as Record<string, unknown>).reduce(
              (result, [key, value]) => {
                if (typeof value === "string" && value.trim()) {
                  result[key] = value.trim();
                }
                return result;
              },
              {} as Record<string, string>,
            )
          : undefined;

      let credentials:
        | {
            account_sid: string;
            auth_token: string;
            whatsapp_from: string | null;
            messaging_service_sid: string | null;
          }
        | undefined;
      if (conversation.twilio_connection_id) {
        const admin = createAdminClient();
        const { data: connection, error: connectionError } = await admin
          .from("twilio_connections")
          .select("account_sid, auth_token, whatsapp_from, messaging_service_sid")
          .eq("id", conversation.twilio_connection_id)
          .eq("is_active", true)
          .single();
        if (connectionError || !connection) {
          return NextResponse.json(
            { error: "Twilio connection is missing or inactive" },
            { status: 400 },
          );
        }
        credentials = connection;
      }

      await sendTwilioWhatsAppTemplate({
        to: conversation.external_user_id,
        contentSid,
        variables,
        credentials,
      });
    } else {
      if (media && conversation.channel !== "whatsapp") {
        return NextResponse.json(
          { error: "Media sending is currently available for WhatsApp conversations only" },
          { status: 400 },
        );
      }
      await sendMessage(conversation, message, media);
    }
  } catch (err) {
    console.error("[API] Failed to send message:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to send message",
      },
      { status: 502 },
    );
  }

  // Store in DB
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    content: contentSid
      ? `Twilio template sent (${contentSid})`
      : message || (media?.type === "image" ? "Image sent" : media ? "Document sent" : ""),
    sent_by_user_id: user?.id ?? null,
    media_type: media?.type ?? null,
    media_url: media?.url ?? null,
    media_mime_type: media?.mimeType ?? null,
    media_filename: media?.filename ?? null,
    provider_media_id: null,
    template_content_sid: contentSid || null,
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
