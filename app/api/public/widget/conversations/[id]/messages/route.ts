import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceRateLimit,
  getVisitorToken,
  parseWidgetMessage,
  requireVisitorConversation,
  submitWebsiteMessage,
  WidgetRequestError,
} from "@/lib/website-chat";

function errorResponse(error: unknown) {
  const status = error instanceof WidgetRequestError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Widget request failed";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireVisitorConversation(id, getVisitorToken(request));
    const after = request.nextUrl.searchParams.get("after");
    const supabase = createAdminClient();
    let query = supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (after && !Number.isNaN(Date.parse(after))) {
      query = query.gt("created_at", after);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ messages: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    enforceRateLimit(`message:${id}`, 30, 60_000);
    const conversation = await requireVisitorConversation(id, getVisitorToken(request));
    const body = (await request.json()) as { message?: unknown };
    const result = await submitWebsiteMessage(
      conversation,
      parseWidgetMessage(body.message),
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[Widget] Message failed:", error);
    return errorResponse(error);
  }
}
