import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyWidgetCors,
  enforceRateLimit,
  ensureAllowedWidgetOrigin,
  ensureConfiguredWidgetOrigin,
  requireOrigin,
  WidgetRequestError,
} from "@/lib/website-chat";

const MAX_TEXT_LENGTH = 200;

function errorResponse(error: unknown, origin?: string) {
  const status = error instanceof WidgetRequestError ? error.status : 500;
  const message =
    error instanceof Error ? error.message : "Unable to submit callback request";
  const response = NextResponse.json({ error: message }, { status });
  return origin ? applyWidgetCors(response, origin) : response;
}

function requiredText(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") throw new WidgetRequestError(`${field} is required`, 400);
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new WidgetRequestError(`${field} is required`, 400);
  if (trimmed.length > maxLength) {
    throw new WidgetRequestError(`${field} must be at most ${maxLength} characters`, 400);
  }
  return trimmed;
}

function parseDate(value: unknown) {
  const date = requiredText(value, "Preferred date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new WidgetRequestError("Preferred date must use YYYY-MM-DD format", 400);
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new WidgetRequestError("Preferred date is invalid", 400);
  }
  return date;
}

function parseTime(value: unknown) {
  const time = requiredText(value, "Preferred time", 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new WidgetRequestError("Preferred time must use HH:MM format", 400);
  }
  return time;
}

function parseUtm(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key, item]) =>
          /^utm_(source|medium|campaign|term|content)$/.test(key) &&
          typeof item === "string",
      )
      .map(([key, item]) => [key, String(item).slice(0, 200)]),
  );
}

export async function OPTIONS(request: Request) {
  let origin: string | undefined;
  try {
    origin = requireOrigin(request);
    await ensureConfiguredWidgetOrigin(origin);
    return applyWidgetCors(new NextResponse(null, { status: 204 }), origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

export async function POST(request: Request) {
  let origin: string | undefined;
  try {
    origin = requireOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const publicKey = requiredText(body.publicKey, "Website key", 200);
    const sourceUrl = requiredText(body.sourceUrl, "Source URL", 2_000);
    const sourceUrlObject = new URL(sourceUrl);
    if (sourceUrlObject.origin !== origin) {
      throw new WidgetRequestError("Source URL does not match request origin", 403);
    }

    await ensureAllowedWidgetOrigin(publicKey, origin);
    enforceRateLimit(
      `${origin}:${request.headers.get("x-forwarded-for") || "unknown"}`,
      10,
      10 * 60_000,
    );

    // A hidden field lets the frontend reject basic automated submissions
    // without revealing that the request was ignored.
    if (typeof body.website === "string" && body.website.trim()) {
      return applyWidgetCors(NextResponse.json({ ok: true }, { status: 201 }), origin);
    }

    const fullName = requiredText(body.fullName, "Name", 120);
    const email = requiredText(body.email, "Email", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new WidgetRequestError("Email is invalid", 400);
    }
    const phone = requiredText(body.phone, "Phone", 40);
    if (phone.replace(/\D/g, "").length < 7) {
      throw new WidgetRequestError("Phone is invalid", 400);
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("submit_callback_request", {
      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
      p_course: requiredText(body.course, "Course", 200),
      p_preferred_date: parseDate(body.preferredDate),
      p_preferred_time: parseTime(body.preferredTime),
      p_preferred_timezone:
        typeof body.preferredTimezone === "string"
          ? requiredText(body.preferredTimezone, "Preferred timezone", 100)
          : "Asia/Singapore",
      p_source_url: sourceUrlObject.toString().slice(0, 2_000),
      p_referrer:
        typeof body.referrer === "string" ? body.referrer.slice(0, 2_000) : null,
      p_utm: parseUtm(body.utm),
    });
    if (error || !data?.[0]) {
      throw new Error(error?.message || "Unable to save callback request");
    }

    return applyWidgetCors(
      NextResponse.json(
        {
          callbackRequestId: data[0].callback_request_id,
          leadId: data[0].lead_id,
          leadCreated: data[0].lead_created,
        },
        { status: 201 },
      ),
      origin,
    );
  } catch (error) {
    console.error("[Callback request] Submission failed:", error);
    return errorResponse(error, origin);
  }
}
