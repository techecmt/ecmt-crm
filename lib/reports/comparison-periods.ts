import { getSgtDateKey } from "@/lib/timezone";

export type DateRange = {
  from: string;
  to: string;
};

export type ComparisonPreset = "last7" | "last30" | "mom" | "qoq" | "yoy";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addSgtDays(dateKey: string, days: number) {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS;
  const date = new Date(utc);
  return toDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function daysInRange(range: DateRange) {
  const from = parseDateKey(range.from);
  const to = parseDateKey(range.to);
  if (!from || !to) return 0;
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  return Math.floor((toUtc - fromUtc) / DAY_MS) + 1;
}

export function isValidDateRange(range: DateRange) {
  if (!parseDateKey(range.from) || !parseDateKey(range.to)) return false;
  return range.from <= range.to;
}

/** Equal-length period immediately before `range`. */
export function previousEqualPeriod(range: DateRange): DateRange {
  const length = daysInRange(range);
  if (length <= 0) return range;
  const to = addSgtDays(range.from, -1);
  const from = addSgtDays(to, -(length - 1));
  return { from, to };
}

function monthRange(year: number, month: number): DateRange {
  const from = toDateKey(year, month, 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: toDateKey(year, month, lastDay) };
}

function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

/** Quarter is 1–4. */
function quarterRange(year: number, quarter: number): DateRange {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    from: monthRange(year, startMonth).from,
    to: monthRange(year, endMonth).to,
  };
}

function getQuarter(month: number) {
  return Math.floor((month - 1) / 3) + 1;
}

/**
 * Period A = primary / current window.
 * Period B = comparison baseline.
 */
export function getPresetComparison(
  preset: ComparisonPreset,
  now: Date = new Date(),
): { periodA: DateRange; periodB: DateRange } {
  const todayKey = getSgtDateKey(now);
  const today = parseDateKey(todayKey);
  if (!today) {
    const empty = { from: todayKey, to: todayKey };
    return { periodA: empty, periodB: empty };
  }

  if (preset === "last7" || preset === "last30") {
    const length = preset === "last7" ? 7 : 30;
    const periodA: DateRange = {
      from: addSgtDays(todayKey, -(length - 1)),
      to: todayKey,
    };
    return { periodA, periodB: previousEqualPeriod(periodA) };
  }

  if (preset === "mom") {
    // Last complete calendar month vs the month before it.
    const previous = shiftMonth(today.year, today.month, -1);
    const before = shiftMonth(today.year, today.month, -2);
    return {
      periodA: monthRange(previous.year, previous.month),
      periodB: monthRange(before.year, before.month),
    };
  }

  if (preset === "qoq") {
    const currentQuarter = getQuarter(today.month);
    // Last complete quarter vs the quarter before it.
    let year = today.year;
    let quarter = currentQuarter - 1;
    if (quarter < 1) {
      quarter = 4;
      year -= 1;
    }
    let prevYear = year;
    let prevQuarter = quarter - 1;
    if (prevQuarter < 1) {
      prevQuarter = 4;
      prevYear -= 1;
    }
    return {
      periodA: quarterRange(year, quarter),
      periodB: quarterRange(prevYear, prevQuarter),
    };
  }

  // YoY: last complete calendar month vs same month previous year.
  const previous = shiftMonth(today.year, today.month, -1);
  return {
    periodA: monthRange(previous.year, previous.month),
    periodB: monthRange(previous.year - 1, previous.month),
  };
}

function formatDateKeyParts(parts: { year: number; month: number; day: number }, withYear = true) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
}

/** Human-readable single date, e.g. "1 Jul 2026". */
export function formatDateKeyReadable(dateKey: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  return formatDateKeyParts(parts);
}

/** Full range label, e.g. "1–31 Jul 2026" or "1 Jul – 15 Aug 2026". */
export function formatDateRangeLabel(range: DateRange) {
  const fromParts = parseDateKey(range.from);
  const toParts = parseDateKey(range.to);
  if (!fromParts || !toParts) return `${range.from} – ${range.to}`;

  if (range.from === range.to) {
    return formatDateKeyParts(fromParts);
  }

  if (fromParts.year === toParts.year && fromParts.month === toParts.month) {
    const monthYear = new Intl.DateTimeFormat("en-SG", {
      timeZone: "UTC",
      month: "short",
      year: "numeric",
    }).format(new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day)));
    return `${fromParts.day}–${toParts.day} ${monthYear}`;
  }

  if (fromParts.year === toParts.year) {
    return `${formatDateKeyParts(fromParts, false)} – ${formatDateKeyParts(toParts)}`;
  }

  return `${formatDateKeyParts(fromParts)} – ${formatDateKeyParts(toParts)}`;
}

/** Compact range for table/chart headers, e.g. "1–31 Jul". */
export function formatDateRangeCompact(range: DateRange) {
  const fromParts = parseDateKey(range.from);
  const toParts = parseDateKey(range.to);
  if (!fromParts || !toParts) return `${range.from} – ${range.to}`;

  if (range.from === range.to) {
    return formatDateKeyParts(fromParts, false);
  }

  if (fromParts.year === toParts.year && fromParts.month === toParts.month) {
    const month = new Intl.DateTimeFormat("en-SG", {
      timeZone: "UTC",
      month: "short",
    }).format(new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day)));
    return `${fromParts.day}–${toParts.day} ${month}`;
  }

  return `${formatDateKeyParts(fromParts, false)} – ${formatDateKeyParts(toParts, false)}`;
}

export const COMPARISON_PRESET_LABELS: Record<ComparisonPreset, string> = {
  last7: "Last 7 vs prior 7",
  last30: "Last 30 vs prior 30",
  mom: "MoM",
  qoq: "QoQ",
  yoy: "YoY",
};
