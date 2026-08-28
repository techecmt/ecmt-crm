/**
 * AI availability schedule shared by the settings editor and the inbound
 * webhook. Stored on `ai_agents.business_hours` as
 * `{ timezone, days: { mon: [{ start, end }], ... } }` with 24-hour HH:MM times.
 */

export const AI_HOURS_DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type AiHoursDayKey = (typeof AI_HOURS_DAY_KEYS)[number];

export type AiHoursWindow = { start: string; end: string };

export type AiHoursSchedule = {
  timezone: string;
  days: Partial<Record<AiHoursDayKey, AiHoursWindow[]>>;
};

export const AI_HOURS_DAY_LABELS: Record<AiHoursDayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const AI_HOURS_DAY_SHORT_LABELS: Record<AiHoursDayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const DEFAULT_AI_HOURS_TIMEZONE = "Asia/Singapore";

export const DEFAULT_AI_HOURS_SCHEDULE: AiHoursSchedule = {
  timezone: DEFAULT_AI_HOURS_TIMEZONE,
  days: {
    mon: [{ start: "09:00", end: "18:00" }],
    tue: [{ start: "09:00", end: "18:00" }],
    wed: [{ start: "09:00", end: "18:00" }],
    thu: [{ start: "09:00", end: "18:00" }],
    fri: [{ start: "09:00", end: "18:00" }],
  },
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeValue(value: string) {
  return TIME_PATTERN.test(value);
}

function toMinutes(value: string) {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatTimeValue(value: string) {
  const minutes = toMinutes(value);
  if (minutes === null) return value;
  const hours = Math.floor(minutes / 60);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

/** Accepts whatever is in the database and returns a schedule we can reason about. */
export function normalizeAiHoursSchedule(input: unknown): AiHoursSchedule {
  const record = (input ?? {}) as Partial<AiHoursSchedule>;
  const timezone =
    typeof record.timezone === "string" && record.timezone.trim()
      ? record.timezone.trim()
      : DEFAULT_AI_HOURS_TIMEZONE;

  const rawDays = (record.days ?? {}) as Record<string, unknown>;
  const days: AiHoursSchedule["days"] = {};

  for (const dayKey of AI_HOURS_DAY_KEYS) {
    const windows = rawDays[dayKey];
    if (!Array.isArray(windows)) continue;
    const cleaned = windows
      .map((window) => {
        const item = (window ?? {}) as Partial<AiHoursWindow>;
        return { start: String(item.start ?? ""), end: String(item.end ?? "") };
      })
      .filter((window) => isValidTimeValue(window.start) && isValidTimeValue(window.end));
    if (cleaned.length) days[dayKey] = cleaned;
  }

  return { timezone, days };
}

export function hasAnyAiHours(schedule: AiHoursSchedule) {
  return AI_HOURS_DAY_KEYS.some((day) => (schedule.days[day]?.length ?? 0) > 0);
}

const WEEKDAY_TO_KEY: Record<string, AiHoursDayKey> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

/** Weekday and minute-of-day for `at`, read in the schedule's own timezone. */
function localPosition(schedule: AiHoursSchedule, at: Date) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    // An invalid timezone must not take the bot offline permanently.
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_AI_HOURS_TIMEZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  }

  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const dayKey = WEEKDAY_TO_KEY[lookup.get("weekday") ?? ""];
  const hour = Number(lookup.get("hour") ?? "0");
  const minute = Number(lookup.get("minute") ?? "0");
  if (!dayKey) return null;
  return { dayKey, minutes: hour * 60 + minute };
}

function previousDay(dayKey: AiHoursDayKey): AiHoursDayKey {
  const index = AI_HOURS_DAY_KEYS.indexOf(dayKey);
  return AI_HOURS_DAY_KEYS[(index + AI_HOURS_DAY_KEYS.length - 1) % AI_HOURS_DAY_KEYS.length];
}

/**
 * True when `at` falls inside one of the configured windows. A window whose end
 * is at or before its start wraps past midnight (e.g. 22:00–02:00).
 */
export function isWithinAiHours(schedule: AiHoursSchedule, at: Date = new Date()) {
  const position = localPosition(schedule, at);
  if (!position) return true;

  const sameDay = schedule.days[position.dayKey] ?? [];
  for (const window of sameDay) {
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    if (start === null || end === null) continue;
    if (end > start) {
      if (position.minutes >= start && position.minutes < end) return true;
    } else if (position.minutes >= start) {
      // Wrapping window, evening portion.
      return true;
    }
  }

  // Morning tail of a window that started the day before.
  const yesterday = schedule.days[previousDay(position.dayKey)] ?? [];
  for (const window of yesterday) {
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    if (start === null || end === null) continue;
    if (end <= start && position.minutes < end) return true;
  }

  return false;
}

/** Short human summary such as "Mon-Fri 9:00 AM - 6:00 PM". */
export function describeAiHours(schedule: AiHoursSchedule) {
  const active = AI_HOURS_DAY_KEYS.filter((day) => (schedule.days[day]?.length ?? 0) > 0);
  if (!active.length) return "No hours configured";

  const signature = (day: AiHoursDayKey) =>
    (schedule.days[day] ?? []).map((window) => `${window.start}-${window.end}`).join(", ");

  const groups: Array<{ days: AiHoursDayKey[]; signature: string }> = [];
  for (const day of active) {
    const daySignature = signature(day);
    const last = groups[groups.length - 1];
    const contiguous =
      last &&
      last.signature === daySignature &&
      AI_HOURS_DAY_KEYS.indexOf(day) ===
        AI_HOURS_DAY_KEYS.indexOf(last.days[last.days.length - 1]) + 1;
    if (contiguous) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], signature: daySignature });
    }
  }

  return groups
    .map((group) => {
      const label =
        group.days.length > 1
          ? `${AI_HOURS_DAY_SHORT_LABELS[group.days[0]]}-${AI_HOURS_DAY_SHORT_LABELS[group.days[group.days.length - 1]]}`
          : AI_HOURS_DAY_SHORT_LABELS[group.days[0]];
      const windows = (schedule.days[group.days[0]] ?? [])
        .map((window) => `${formatTimeValue(window.start)} - ${formatTimeValue(window.end)}`)
        .join(", ");
      return `${label} ${windows}`;
    })
    .join(" · ");
}
