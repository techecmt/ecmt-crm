import { OPEN_CALLBACK_REQUEST_STATUSES } from "@/lib/callback-request-assignment";
import { differenceInSgtCalendarDays, getSgtDateKey, sgtDateTimeToUtcIso } from "@/lib/timezone";
import type {
  CallbackRequest,
  CallbackRequestStatus,
  CallbackRequestType,
} from "@/lib/types";

export type QuickFilter = "all" | "today" | "overdue" | "unassigned" | "new";

/** Badge + accent styling per status, matching the lead status badge conventions. */
export const STATUS_STYLES: Record<CallbackRequestStatus, string> = {
  new: "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/20 dark:text-blue-300",
  contacted:
    "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300",
  confirmed:
    "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300",
  completed:
    "bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-500/20 dark:text-slate-300",
  cancelled:
    "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/20 dark:text-rose-300",
};

export const STATUS_DOT_STYLES: Record<CallbackRequestStatus, string> = {
  new: "bg-blue-500",
  contacted: "bg-amber-500",
  confirmed: "bg-emerald-500",
  completed: "bg-slate-400",
  cancelled: "bg-rose-500",
};

/** Left accent rail on an agenda row: appointments read as booked, callbacks as pending. */
export const TYPE_RAIL_STYLES: Record<CallbackRequestType, string> = {
  appointment: "bg-emerald-500",
  callback: "bg-blue-500",
};

export function isOpenStatus(status: CallbackRequestStatus) {
  return (OPEN_CALLBACK_REQUEST_STATUSES as readonly string[]).includes(status);
}

export function requestStartMs(request: Pick<CallbackRequest, "preferred_date" | "preferred_time">) {
  const iso = sgtDateTimeToUtcIso(request.preferred_date, request.preferred_time);
  return iso ? new Date(iso).getTime() : null;
}

/** A request is overdue when its slot has passed and nobody has closed it out. */
export function isOverdueRequest(
  request: Pick<CallbackRequest, "preferred_date" | "preferred_time" | "status">,
  nowMs: number,
) {
  if (!isOpenStatus(request.status)) return false;
  const startMs = requestStartMs(request);
  return startMs !== null && startMs < nowMs;
}

export function dateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatDayHeading(date: Date) {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatShortDay(date: Date) {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** "Today" / "Tomorrow" / "Yesterday" / "in 3 days" / "5 days ago", or null when far out. */
export function relativeDayLabel(dateKey: string, todayKey = getSgtDateKey()) {
  const diff = differenceInSgtCalendarDays(
    `${dateKey}T00:00:00.000Z`,
    `${todayKey}T00:00:00.000Z`,
  );
  if (Number.isNaN(diff)) return null;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff <= 7) return `In ${diff} days`;
  if (diff < -1 && diff >= -7) return `${Math.abs(diff)} days ago`;
  return null;
}

export function formatTimeLabel(time: string) {
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatEndTimeLabel(time: string, durationMinutes: number) {
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const total = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(total / 60) % 24;
  const endMinutes = total % 60;
  return formatTimeLabel(`${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`);
}

export type RequestSummary = {
  total: number;
  today: number;
  overdue: number;
  unassigned: number;
  unhandled: number;
  appointments: number;
};

export function summariseRequests(
  requests: Array<
    Pick<
      CallbackRequest,
      "preferred_date" | "preferred_time" | "status" | "assigned_counsellor" | "request_type"
    >
  >,
  nowMs: number,
  todayKey = getSgtDateKey(nowMs),
): RequestSummary {
  const summary: RequestSummary = {
    total: requests.length,
    today: 0,
    overdue: 0,
    unassigned: 0,
    unhandled: 0,
    appointments: 0,
  };
  for (const request of requests) {
    if (request.preferred_date === todayKey) summary.today += 1;
    if (isOverdueRequest(request, nowMs)) summary.overdue += 1;
    if (!request.assigned_counsellor && isOpenStatus(request.status)) summary.unassigned += 1;
    if (request.status === "new") summary.unhandled += 1;
    if (request.request_type === "appointment") summary.appointments += 1;
  }
  return summary;
}

export function matchesQuickFilter(
  request: Pick<
    CallbackRequest,
    "preferred_date" | "preferred_time" | "status" | "assigned_counsellor"
  >,
  quickFilter: QuickFilter,
  nowMs: number,
  todayKey: string,
) {
  switch (quickFilter) {
    case "today":
      return request.preferred_date === todayKey;
    case "overdue":
      return isOverdueRequest(request, nowMs);
    case "unassigned":
      return !request.assigned_counsellor && isOpenStatus(request.status);
    case "new":
      return request.status === "new";
    default:
      return true;
  }
}
