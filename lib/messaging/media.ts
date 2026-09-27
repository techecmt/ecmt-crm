import type { WhatsAppMediaType } from "@/lib/messaging/types";

export const MESSAGE_MEDIA_BUCKET = "message-media";

export const WHATSAPP_MEDIA_LIMITS_BYTES: Record<WhatsAppMediaType, number> = {
  image: 8 * 1024 * 1024,
  document: 15 * 1024 * 1024,
};

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export const WHATSAPP_ALLOWED_MEDIA_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES,
] as const;

const MIME_TYPE_BY_EXTENSION: Record<string, (typeof WHATSAPP_ALLOWED_MEDIA_MIME_TYPES)[number]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export function classifyWhatsAppMedia(input: {
  mimeType?: string | null;
  filename?: string | null;
}): { type: WhatsAppMediaType; mimeType: (typeof WHATSAPP_ALLOWED_MEDIA_MIME_TYPES)[number] } | null {
  const rawMime = input.mimeType?.trim().toLowerCase() ?? "";
  const extension =
    input.filename?.toLowerCase().split(".").filter(Boolean).pop() ?? null;
  const mimeType =
    (WHATSAPP_ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(rawMime)
      ? (rawMime as (typeof WHATSAPP_ALLOWED_MEDIA_MIME_TYPES)[number])
      : extension
        ? MIME_TYPE_BY_EXTENSION[extension] ?? null
        : null;
  if (!mimeType) return null;

  return {
    type: mimeType.startsWith("image/") ? "image" : "document",
    mimeType,
  };
}

export function isAllowedWhatsAppMediaSize(type: WhatsAppMediaType, sizeBytes: number) {
  return sizeBytes > 0 && sizeBytes <= WHATSAPP_MEDIA_LIMITS_BYTES[type];
}

export function sanitizeUploadFilename(filename: string | null | undefined) {
  const fallback = "file";
  const value = (filename ?? "").trim();
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return (safe || fallback).slice(0, 120);
}

export function inferMimeFromFilename(filename: string) {
  const extension = filename.toLowerCase().split(".").filter(Boolean).pop();
  if (!extension) return null;
  return MIME_TYPE_BY_EXTENSION[extension] ?? null;
}
