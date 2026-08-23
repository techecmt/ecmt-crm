import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function resolveAgentId(supabase: Awaited<ReturnType<typeof createClient>>, agentId?: string | null) {
  if (agentId) return agentId;
  const { data } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return forbidden();
  }

  const agentParam = request.nextUrl.searchParams.get("agent_id");
  const supabase = await createClient();
  const agentId = await resolveAgentId(supabase, agentParam);
  if (!agentId) {
    return NextResponse.json({ error: "No AI agent found" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ai_knowledge")
    .select("*")
    .eq("agent_id", agentId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return forbidden();
  }
  if (!isAdminRole(profile.role)) {
    return forbidden();
  }

  const body = (await request.json()) as {
    agent_id?: string;
    title?: string;
    content?: string;
    is_active?: boolean;
    sort_order?: number;
    category?: string;
  };

  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json(
      { error: "Title and content are required" },
      { status: 400 },
    );
  }
  if (!body.agent_id) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_knowledge")
    .insert({
      agent_id: body.agent_id,
      title: body.title.trim(),
      content: body.content.trim(),
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 0,
      category: body.category ?? "general",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
