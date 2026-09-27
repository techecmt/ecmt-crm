import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import {
  MESSAGE_MEDIA_BUCKET,
  WHATSAPP_ALLOWED_MEDIA_MIME_TYPES,
  WHATSAPP_MEDIA_LIMITS_BYTES,
  classifyWhatsAppMedia,
  isAllowedWhatsAppMediaSize,
  sanitizeUploadFilename,
} from "@/lib/messaging/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ConversationParams = { params: Promise<{ id: string }> };

async function requireWhatsAppConversation(conversationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, channel")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (data.channel !== "whatsapp") {
    return NextResponse.json(
      { error: "Media attachments are available for WhatsApp conversations only" },
      { status: 400 },
    );
  }
  return null;
}

export async function POST(request: NextRequest, { params }: ConversationParams) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invalidConversation = await requireWhatsAppConversation(id);
  if (invalidConversation) return invalidConversation;

  const formData = await request.formData();
  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const classified = classifyWhatsAppMedia({
    mimeType: uploaded.type || null,
    filename: uploaded.name || null,
  });
  if (!classified) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, PDF.",
      },
      { status: 400 },
    );
  }
  if (!isAllowedWhatsAppMediaSize(classified.type, uploaded.size)) {
    const maxBytes = WHATSAPP_MEDIA_LIMITS_BYTES[classified.type];
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return NextResponse.json(
      { error: `File too large. Max ${maxMb}MB for ${classified.type}.` },
      { status: 400 },
    );
  }

  const filename = sanitizeUploadFilename(uploaded.name || `${classified.type}`);
  const storagePath = `${id}/${Date.now()}-${randomUUID()}-${filename}`;

  const admin = createAdminClient();
  const arrayBuffer = await uploaded.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(MESSAGE_MEDIA_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: classified.mimeType,
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 502 },
    );
  }

  const { data: publicData } = admin.storage
    .from(MESSAGE_MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  return NextResponse.json({
    media: {
      type: classified.type,
      bucket: MESSAGE_MEDIA_BUCKET,
      path: storagePath,
      url: publicData.publicUrl,
      mimeType: classified.mimeType,
      filename,
      sizeBytes: uploaded.size,
      allowedMimeTypes: WHATSAPP_ALLOWED_MEDIA_MIME_TYPES,
    },
  });
}

export async function DELETE(request: NextRequest, { params }: ConversationParams) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invalidConversation = await requireWhatsAppConversation(id);
  if (invalidConversation) return invalidConversation;

  const body = await request.json().catch(() => ({}));
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  if (!path || !path.startsWith(`${id}/`)) {
    return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(MESSAGE_MEDIA_BUCKET).remove([path]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
