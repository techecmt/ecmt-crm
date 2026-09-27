import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function resolveAgentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId?: string | null,
) {
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
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();

  const supabase = await createClient();
  const agentParam = request.nextUrl.searchParams.get("agent_id");
  const agentId = await resolveAgentId(supabase, agentParam);
  if (!agentId) {
    return NextResponse.json({ error: "No AI agent found" }, { status: 400 });
  }

  const { data: courses, error: courseError } = await supabase
    .from("ai_course_catalog")
    .select("*")
    .eq("agent_id", agentId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (courseError) return NextResponse.json({ error: courseError.message }, { status: 500 });

  const courseIds = (courses ?? []).map((course) => course.id as string);
  let assets: Array<Record<string, unknown>> = [];
  if (courseIds.length) {
    const { data: loadedAssets, error: assetError } = await supabase
      .from("ai_course_assets")
      .select("*")
      .in("course_id", courseIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
    assets = (loadedAssets ?? []) as Array<Record<string, unknown>>;
  }

  const assetsByCourse = new Map<string, Array<Record<string, unknown>>>();
  for (const asset of assets) {
    const courseId = asset.course_id as string | undefined;
    if (!courseId) continue;
    const existing = assetsByCourse.get(courseId) ?? [];
    existing.push(asset);
    assetsByCourse.set(courseId, existing);
  }

  const payload = (courses ?? []).map((course) => ({
    ...course,
    assets: assetsByCourse.get(course.id as string) ?? [],
  }));

  return NextResponse.json(payload);
}

type CreateCourseBody = {
  agent_id?: unknown;
  course_name?: unknown;
  fee_summary?: unknown;
  fee_details?: unknown;
  fee_amount?: unknown;
  fee_currency?: unknown;
  keyword_aliases?: unknown;
  is_active?: unknown;
  sort_order?: unknown;
};

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) return forbidden();
  if (!isAdminRole(profile.role)) return forbidden();

  const body = (await request.json()) as CreateCourseBody;
  const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
  const courseName =
    typeof body.course_name === "string" ? body.course_name.trim() : "";
  if (!agentId || !courseName) {
    return NextResponse.json(
      { error: "agent_id and course_name are required" },
      { status: 400 },
    );
  }

  const aliases = Array.isArray(body.keyword_aliases)
    ? body.keyword_aliases
        .map((alias) => (typeof alias === "string" ? alias.trim() : ""))
        .filter(Boolean)
    : [];
  const feeAmount =
    typeof body.fee_amount === "number" && Number.isFinite(body.fee_amount)
      ? body.fee_amount
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_course_catalog")
    .insert({
      agent_id: agentId,
      course_name: courseName,
      fee_summary:
        typeof body.fee_summary === "string" ? body.fee_summary.trim() : "",
      fee_details:
        typeof body.fee_details === "string" ? body.fee_details.trim() : "",
      fee_amount: feeAmount,
      fee_currency:
        typeof body.fee_currency === "string" && body.fee_currency.trim()
          ? body.fee_currency.trim().toUpperCase()
          : "SGD",
      keyword_aliases: aliases,
      is_active: body.is_active !== false,
      sort_order:
        typeof body.sort_order === "number" && Number.isFinite(body.sort_order)
          ? body.sort_order
          : 0,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, assets: [] });
}
