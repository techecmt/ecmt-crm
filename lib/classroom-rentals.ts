import { getSgtDateKey } from "@/lib/timezone";
import {
  ACTIVE_CLASSROOM_RENTAL_STATUSES,
  CLASSROOM_LABELS,
  CLASSROOM_RENTAL_STATUS_LABELS,
  type ClassroomRentalStatus,
  type ClassroomType,
} from "@/lib/types";

export const CLASSROOM_VALUES = Object.keys(CLASSROOM_LABELS) as ClassroomType[];
export const CLASSROOM_RENTAL_STATUS_VALUES = Object.keys(
  CLASSROOM_RENTAL_STATUS_LABELS,
) as ClassroomRentalStatus[];

export const CLASSROOM_BOOKING_START_TIME = "09:00";
export const CLASSROOM_BOOKING_END_TIMES = ["18:00", "19:00", "20:00"] as const;
export const CLASSROOM_ACTIVE_STATUSES = ACTIVE_CLASSROOM_RENTAL_STATUSES;

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

export function monthKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function isWeekdayDate(date: Date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function isPastDateKey(dateKey: string, nowMs = Date.now()) {
  const todayKey = getSgtDateKey(nowMs);
  return dateKey < todayKey;
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
    year: "numeric",
  }).format(date);
}
