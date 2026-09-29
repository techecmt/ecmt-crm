import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type CourseCatalogRow = {
  id: string;
  course_name: string;
  fee_summary: string;
  fee_details: string;
  keyword_aliases: string[] | null;
  sort_order: number;
};

type CourseAssetRow = {
  id: string;
  course_id: string;
  asset_type: "brochure" | "creative";
  media_type: "image" | "document";
  url: string;
  mime_type: string | null;
  filename: string | null;
  caption: string;
  sort_order: number;
  created_at: string;
};

export type SelectedCourseAsset = {
  id: string;
  assetType: "brochure" | "creative";
  mediaType: "image" | "document";
  url: string;
  mimeType: string | null;
  filename: string | null;
  caption: string;
};

export type CourseAssetSelection = {
  courseId: string;
  courseName: string;
  feeSummary: string;
  feeDetails: string;
  assets: SelectedCourseAsset[];
};

export type CourseQueryResolution =
  | { kind: "none" }
  | { kind: "not_found" }
  | { kind: "ambiguous"; options: string[] }
  | { kind: "matched"; selection: CourseAssetSelection };

const ASSET_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function includesToken(haystack: string, needle: string) {
  if (!needle) return false;
  return haystack.includes(needle);
}

function scoreCourseMatch(input: {
  text: string;
  leadCourse: string;
  course: CourseCatalogRow;
}) {
  const normalizedCourseName = normalizeText(input.course.course_name);
  if (!normalizedCourseName) return 0;

  let score = 0;
  if (includesToken(input.text, normalizedCourseName)) score += 90;

  if (input.leadCourse) {
    if (input.leadCourse === normalizedCourseName) score += 140;
    if (includesToken(input.leadCourse, normalizedCourseName)) score += 50;
    if (includesToken(normalizedCourseName, input.leadCourse)) score += 50;
  }

  for (const alias of input.course.keyword_aliases ?? []) {
    const normalizedAlias = normalizeText(alias);
    if (normalizedAlias && includesToken(input.text, normalizedAlias)) {
      score += 30;
    }
  }

  return score;
}

function detectAssetIntent(text: string) {
  const wantsBrochure = /\b(brochure|prospectus|pdf|booklet)\b/i.test(text);
  const wantsCreative = /\b(creative|poster|flyer|banner|image|sample\s*ad)\b/i.test(text);
  const requested: Array<"brochure" | "creative"> = ["brochure"];
  if (wantsCreative) requested.push("creative");
  if (!wantsBrochure && !wantsCreative) return requested;
  if (wantsBrochure && !requested.includes("brochure")) requested.unshift("brochure");
  return requested;
}

function detectCourseIntent(text: string) {
  return /\b(fee|fees|cost|price|tuition|payment|installment|course|program|programme|admission|intake|duration|syllabus|brochure|creative|poster|flyer)\b/i.test(
    text,
  );
}

function buildCourseSelection(input: {
  course: CourseCatalogRow;
  assets: CourseAssetRow[];
  requestedAssetTypes: Array<"brochure" | "creative">;
}): CourseAssetSelection {
  const byType = new Map<"brochure" | "creative", SelectedCourseAsset>();
  for (const asset of input.assets) {
    if (byType.has(asset.asset_type)) continue;
    byType.set(asset.asset_type, {
      id: asset.id,
      assetType: asset.asset_type,
      mediaType: asset.media_type,
      url: asset.url,
      mimeType: asset.mime_type,
      filename: asset.filename,
      caption: asset.caption || "",
    });
  }

  const picked: SelectedCourseAsset[] = [];
  for (const type of input.requestedAssetTypes) {
    const found = byType.get(type);
    if (found) picked.push(found);
  }
  if (!picked.length) {
    const brochure = byType.get("brochure");
    const creative = byType.get("creative");
    if (brochure) picked.push(brochure);
    else if (creative) picked.push(creative);
  }

  return {
    courseId: input.course.id,
    courseName: input.course.course_name,
    feeSummary: input.course.fee_summary,
    feeDetails: input.course.fee_details,
    assets: picked,
  };
}

export async function resolveCourseQueryForMessage(input: {
  supabase: ReturnType<typeof createAdminClient>;
  agentId: string | null | undefined;
  userText: string;
  leadInterestedCourse?: string | null;
}): Promise<CourseQueryResolution> {
  if (!input.agentId) return { kind: "none" };
  if (!detectCourseIntent(input.userText)) return { kind: "none" };

  const { data: courses, error: courseError } = await input.supabase
    .from("ai_course_catalog")
    .select("id,course_name,fee_summary,fee_details,keyword_aliases,sort_order")
    .eq("agent_id", input.agentId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (courseError || !courses?.length) return { kind: "not_found" };

  const normalizedUserText = normalizeText(input.userText);
  const normalizedLeadCourse = normalizeText(input.leadInterestedCourse);
  const ranked = (courses as CourseCatalogRow[])
    .map((course) => ({
      course,
      score: scoreCourseMatch({
        text: normalizedUserText,
        leadCourse: normalizedLeadCourse,
        course,
      }),
    }))
    .sort((a, b) => b.score - a.score || a.course.sort_order - b.course.sort_order);

  const top = ranked[0];
  if (!top || top.score <= 0) return { kind: "not_found" };

  const ambiguousMatches = ranked
    .filter((entry, index) => index < 3 && entry.score > 0 && entry.score >= top.score - 12)
    .map((entry) => entry.course.course_name);
  if (ambiguousMatches.length > 1) {
    return { kind: "ambiguous", options: ambiguousMatches };
  }

  const { data: assets, error: assetsError } = await input.supabase
    .from("ai_course_assets")
    .select(
      "id,course_id,asset_type,media_type,url,mime_type,filename,caption,sort_order,created_at",
    )
    .eq("course_id", top.course.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (assetsError) return { kind: "not_found" };

  const selection = buildCourseSelection({
    course: top.course,
    assets: (assets as CourseAssetRow[]) ?? [],
    requestedAssetTypes: detectAssetIntent(input.userText),
  });
  return { kind: "matched", selection };
}

export function buildCourseDisambiguationReply(options: string[]) {
  if (!options.length) {
    return "I found multiple course matches. Could you share the exact course name so I can send the correct fee details and brochure?";
  }
  const list = options.map((name, index) => `${index + 1}. ${name}`).join("\n");
  return `I found multiple matching courses:\n${list}\n\nPlease reply with the exact course name, and I will share full fee details and the brochure.`;
}

export function buildCourseNotFoundReply() {
  return "I could not find that course in our catalog right now. A counselor can follow up and share the exact fee details, brochure, and creatives.";
}

export function buildCourseMatchedReply(selection: CourseAssetSelection) {
  const summary = selection.feeSummary?.trim();
  const details = selection.feeDetails?.trim();
  const feeText = details || summary || "Fee details are currently being updated.";
  const summaryLine =
    summary && details && summary.toLowerCase() !== details.toLowerCase()
      ? `Summary: ${summary}\n\n`
      : "";
  return `Course: ${selection.courseName}\n\n${summaryLine}Fee Details:\n${feeText}`;
}

export async function selectCourseAssetsForMessage(input: {
  supabase: ReturnType<typeof createAdminClient>;
  agentId: string | null | undefined;
  userText: string;
  leadInterestedCourse?: string | null;
}) {
  const resolution = await resolveCourseQueryForMessage(input);
  if (resolution.kind !== "matched") return null;
  return resolution.selection;
}

export async function filterAssetsByCooldown(input: {
  supabase: ReturnType<typeof createAdminClient>;
  conversationId: string;
  assets: SelectedCourseAsset[];
}) {
  if (!input.assets.length) return [];
  const assetIds = input.assets.map((asset) => asset.id);
  const cutoffIso = new Date(Date.now() - ASSET_COOLDOWN_MS).toISOString();

  const { data: recentSends } = await input.supabase
    .from("messages")
    .select("ai_course_asset_id, created_at")
    .eq("conversation_id", input.conversationId)
    .eq("role", "assistant")
    .in("ai_course_asset_id", assetIds)
    .gte("created_at", cutoffIso);

  const recentAssetIds = new Set(
    (recentSends ?? [])
      .map((row) => row.ai_course_asset_id as string | null)
      .filter((value): value is string => Boolean(value)),
  );

  return input.assets.filter((asset) => !recentAssetIds.has(asset.id));
}

export async function buildCourseCatalogContext(input: {
  supabase: ReturnType<typeof createAdminClient>;
  agentId: string | null | undefined;
}) {
  if (!input.agentId) return null;
  const { data: courses, error } = await input.supabase
    .from("ai_course_catalog")
    .select("course_name,fee_summary,fee_details,fee_amount,fee_currency,keyword_aliases")
    .eq("agent_id", input.agentId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(30);
  if (error || !courses?.length) return null;

  const lines = courses.map((course) => {
    const feeAmount =
      typeof course.fee_amount === "number" && Number.isFinite(course.fee_amount)
        ? ` (${course.fee_currency || "SGD"} ${course.fee_amount})`
        : "";
    const summary =
      (course.fee_summary as string | null)?.trim() ||
      (course.fee_details as string | null)?.trim() ||
      "No fee details added";
    const aliases = ((course.keyword_aliases as string[] | null) ?? [])
      .map((alias) => alias.trim())
      .filter(Boolean);
    const aliasText = aliases.length ? ` [aliases: ${aliases.join(", ")}]` : "";
    return `- ${course.course_name}${feeAmount}: ${summary}${aliasText}`;
  });

  return `Course fee catalog (authoritative):\n${lines.join("\n")}`;
}
