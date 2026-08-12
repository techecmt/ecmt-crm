import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const before = request.nextUrl.searchParams.get("before");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || "50");
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
    : 50;

  let query = supabase
    .from("messages")
    .select("id, role, content, whatsapp_msg_id, external_msg_id, sent_by_user_id, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: newestFirstMessages, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasMore = (newestFirstMessages?.length || 0) > limit;
  const page = (newestFirstMessages || []).slice(0, limit);
  const nextCursor = hasMore ? page[page.length - 1]?.created_at ?? null : null;

  return NextResponse.json({
    messages: page.reverse(),
    nextCursor,
  });
}
