import { NextResponse } from "next/server";

import {
  applyWidgetCors,
  createWebsiteConversation,
  enforceRateLimit,
  ensureAllowedWidgetOrigin,
  ensureConfiguredWidgetOrigin,
  requireOrigin,
  WidgetRequestError,
} from "@/lib/website-chat";

function errorResponse(error: unknown, origin?: string) {
  const status = error instanceof WidgetRequestError ? error.status : 500;
  const message =
    error instanceof Error ? error.message : "Unable to start the chat widget";
  const response = NextResponse.json({ error: message }, { status });
  return origin ? applyWidgetCors(response, origin) : response;
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
    const body = (await request.json()) as {
      publicKey?: unknown;
      sourceUrl?: unknown;
      referrer?: unknown;
      utm?: unknown;
    };
    if (typeof body.publicKey !== "string" || !body.publicKey.trim()) {
      throw new WidgetRequestError("Widget key is required", 400);
    }
    if (typeof body.sourceUrl !== "string") {
      throw new WidgetRequestError("Source URL is required", 400);
    }

    const sourceUrl = new URL(body.sourceUrl);
    if (sourceUrl.origin !== origin) {
      throw new WidgetRequestError("Source URL does not match request origin", 403);
    }
    await ensureAllowedWidgetOrigin(body.publicKey.trim(), origin);
    enforceRateLimit(
      `${origin}:${request.headers.get("x-forwarded-for") || "unknown"}`,
      20,
      10 * 60_000,
    );

    const utm =
      body.utm &&
      typeof body.utm === "object" &&
      !Array.isArray(body.utm)
        ? Object.fromEntries(
            Object.entries(body.utm as Record<string, unknown>)
              .filter(
                ([key, value]) =>
                  /^utm_(source|medium|campaign|term|content)$/.test(key) &&
                  typeof value === "string",
              )
              .map(([key, value]) => [key, String(value).slice(0, 200)]),
          )
        : {};

    const session = await createWebsiteConversation({
      sourceUrl: sourceUrl.toString().slice(0, 2_000),
      referrer:
        typeof body.referrer === "string" ? body.referrer.slice(0, 2_000) : undefined,
      utm,
    });
    return applyWidgetCors(NextResponse.json(session, { status: 201 }), origin);
  } catch (error) {
    console.error("[Widget] Bootstrap failed:", error);
    return errorResponse(error, origin);
  }
}
