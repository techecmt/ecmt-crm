import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import {
  classifyWhatsAppMedia,
  isAllowedWhatsAppMediaSize,
  sanitizeUploadFilename,
  WHATSAPP_MEDIA_LIMITS_BYTES,
} from "@/lib/messaging/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

const COURSE_ASSETS_BUCKET = "course-assets";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const formData = await request.formData();
  const courseId = String(formData.get("course_id") ?? "").trim();
  const assetType = String(formData.get("asset_type") ?? "").trim();
  const uploaded = formData.get("file");
  const caption = String(formData.get("caption") ?? "").trim();
  const sortOrderRaw = Number(formData.get("sort_order") ?? "0");
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, Math.floor(sortOrderRaw)) : 0;

  if (!courseId) {
    return NextResponse.json({ error: "course_id is required" }, { status: 400 });
  }
  if (assetType !== "brochure" && assetType !== "creative") {
    return NextResponse.json(
      { error: "asset_type must be brochure or creative" },
      { status: 400 },
    );
  }
  if (!(uploaded instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const classified = classifyWhatsAppMedia({
    mimeType: uploaded.type || null,
    filename: uploaded.name || null,
  });
  if (!classified) {
    return NextResponse.json(
      { error: "Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, PDF." },
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

  const supabase = await createClient();
  const { data: course, error: courseError } = await supabase
    .from("ai_course_catalog")
    .select("id")
    .eq("id", courseId)
    .single();
  if (courseError || !course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const filename = sanitizeUploadFilename(uploaded.name || classified.type);
  const storagePath = `${courseId}/${Date.now()}-${randomUUID()}-${filename}`;
  const arrayBuffer = await uploaded.arrayBuffer();

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(COURSE_ASSETS_BUCKET)
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
    .from(COURSE_ASSETS_BUCKET)
    .getPublicUrl(storagePath);

  const { data: created, error: insertError } = await supabase
    .from("ai_course_assets")
    .insert({
      course_id: courseId,
      asset_type: assetType,
      media_type: classified.type,
      bucket: COURSE_ASSETS_BUCKET,
      path: storagePath,
      url: publicData.publicUrl,
      mime_type: classified.mimeType,
      filename,
      caption,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (insertError || !created) {
    await admin.storage.from(COURSE_ASSETS_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: insertError?.message || "Failed to save asset" },
      { status: 500 },
    );
  }

  return NextResponse.json(created);
}
