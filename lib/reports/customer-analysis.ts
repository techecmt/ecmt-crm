import type { NotInterestedReason } from "@/lib/types";

const QUESTION_PATTERN =
  /\?|\b(how|what|when|where|why|can|could|would|is|are|do|does|fee|fees|cost|price|schedule|intake|start|eligible|qualification|duration|certificate|diploma|class|classes|payment|installment|register|registration|apply|application)\b/i;

export function isLikelyQuestion(content: string) {
  const trimmed = content.trim();
  if (trimmed.length < 4) return false;
  return QUESTION_PATTERN.test(trimmed);
}

export function reasonLabel(reason: NotInterestedReason | null | undefined) {
  if (!reason) return "Unspecified";
  const labels: Record<NotInterestedReason, string> = {
    financial_issues: "Financial Issues",
    employer_issues: "Employer Issues",
    class_schedule_issues: "Class Schedule Issues",
    other: "Other",
  };
  return labels[reason];
}

export function channelLabel(channel: "whatsapp" | "messenger" | "website") {
  const labels = {
    whatsapp: "WhatsApp",
    messenger: "Messenger",
    website: "Website",
  } as const;
  return labels[channel];
}

export function percent(part: number, whole: number) {
  if (whole === 0) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function countByKey<T extends string>(
  items: T[],
  fallback: T,
): { id: T; name: string; count: number }[] {
  const map = new Map<T, number>();
  for (const item of items) {
    const key = item || fallback;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([id, count]) => ({ id, name: id, count }))
    .sort((a, b) => b.count - a.count);
}
