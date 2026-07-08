export const APP_TIMEZONE = "Asia/Singapore";

const SGT_OFFSET_HOURS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

type DateInput = Date | string | number;

function toDate(input: DateInput) {
  return input instanceof Date ? input : new Date(input);
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

function getPart(
  date: Date,
  part: Intl.DateTimeFormatPartTypes,
  options?: Intl.DateTimeFormatOptions,
) {
  const formatter = new Intl.DateTimeFormat("en-SG", {
    timeZone: APP_TIMEZONE,
    hourCycle: "h23",
    ...options,
  });
  const pieces = formatter.formatToParts(date);
  return pieces.find((piece) => piece.type === part)?.value ?? "";
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function parseTimeKey(timeKey: string) {
  const [hour, minute] = timeKey.split(":").map(Number);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, month };
}

export function getSgtDateKey(input: DateInput = new Date()) {
  const date = toDate(input);
  if (!isValidDate(date)) return "";
  const year = getPart(date, "year", { year: "numeric" });
  const month = getPart(date, "month", { month: "2-digit" });
  const day = getPart(date, "day", { day: "2-digit" });
  return `${year}-${month}-${day}`;
}

export function getSgtMonthKey(input: DateInput = new Date()) {
  const date = toDate(input);
  if (!isValidDate(date)) return "";
  const year = getPart(date, "year", { year: "numeric" });
  const month = getPart(date, "month", { month: "2-digit" });
  return `${year}-${month}`;
}

export function getSgtHour(input: DateInput) {
  const date = toDate(input);
  if (!isValidDate(date)) return NaN;
  return Number(getPart(date, "hour", { hour: "2-digit" }));
}

function getSgtDateTimeParts(input: DateInput) {
  const date = toDate(input);
  if (!isValidDate(date)) return null;
  const formatter = new Intl.DateTimeFormat("en-SG", {
    timeZone: APP_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((piece) => [piece.type, piece.value]));
  return {
    year: map.get("year") ?? "0000",
    month: map.get("month") ?? "00",
    day: map.get("day") ?? "00",
    hour: map.get("hour") ?? "00",
    minute: map.get("minute") ?? "00",
    second: map.get("second") ?? "00",
  };
}

export function formatSgtDate(input: DateInput) {
  const date = toDate(input);
  if (!isValidDate(date)) return "";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatSgtDateTime(input: DateInput) {
  const date = toDate(input);
  if (!isValidDate(date)) return "";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatSgtTime24(input: DateInput) {
  const date = toDate(input);
  if (!isValidDate(date)) return "";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatSgtDateTimeExport(input: DateInput) {
  const parts = getSgtDateTimeParts(input);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatSgtTimestampKey(input: DateInput = new Date()) {
  const parts = getSgtDateTimeParts(input);
  if (!parts) return "";
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

export function formatSgtMonthYear(input: DateInput) {
  const date = toDate(input);
  if (!isValidDate(date)) return "";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: APP_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getSgtDayStartUtcIso(dateKey: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) return undefined;
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, -SGT_OFFSET_HOURS, 0, 0, 0);
  return new Date(utcMs).toISOString();
}

export function getSgtDayEndUtcIso(dateKey: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) return undefined;
  const utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    23 - SGT_OFFSET_HOURS,
    59,
    59,
    999,
  );
  return new Date(utcMs).toISOString();
}

export function getSgtMonthRangeUtc(monthKey: string) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  const startDateKey = `${String(parsed.year)}-${String(parsed.month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  const endDateKey = `${String(parsed.year)}-${String(parsed.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return {
    startIso: getSgtDayStartUtcIso(startDateKey)!,
    endIso: getSgtDayEndUtcIso(endDateKey)!,
  };
}

export function sgtDateTimeToUtcIso(dateKey: string, timeKey: string) {
  const dateParts = parseDateKey(dateKey);
  const timeParts = parseTimeKey(timeKey);
  if (!dateParts || !timeParts) return undefined;

  const utcMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour - SGT_OFFSET_HOURS,
    timeParts.minute,
    0,
    0,
  );
  return new Date(utcMs).toISOString();
}

export function differenceInSgtCalendarDays(later: DateInput, earlier: DateInput) {
  const laterKey = getSgtDateKey(later);
  const earlierKey = getSgtDateKey(earlier);
  const laterParts = parseDateKey(laterKey);
  const earlierParts = parseDateKey(earlierKey);
  if (!laterParts || !earlierParts) return NaN;

  const laterUtc = Date.UTC(laterParts.year, laterParts.month - 1, laterParts.day);
  const earlierUtc = Date.UTC(earlierParts.year, earlierParts.month - 1, earlierParts.day);
  return Math.floor((laterUtc - earlierUtc) / DAY_MS);
}
