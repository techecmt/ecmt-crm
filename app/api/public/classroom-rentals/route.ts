import { NextResponse } from "next/server";

import {
  CLASSROOM_ACTIVE_STATUSES,
  CLASSROOM_BOOKING_END_TIMES,
  CLASSROOM_VALUES,
} from "@/lib/classroom-rentals";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSgtDateKey } from "@/lib/timezone";
import type { ClassroomType } from "@/lib/types";

const MAX_TEXT_LENGTH = 200;

function responseError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requiredText(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

function parseClassroom(value: unknown): ClassroomType {
  const classroom = requiredText(value, "Classroom", 32).toLowerCase() as ClassroomType;
  if (!CLASSROOM_VALUES.includes(classroom)) {
    throw new Error("Classroom must be classroom_1, classroom_2, or classroom_3");
  }
  return classroom;
}

function parseDate(value: unknown) {
  const date = requiredText(value, "Booking date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Booking date must use YYYY-MM-DD format");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Booking date is invalid");
  }
  const day = parsed.getUTCDay();
  if (day === 0 || day === 6) {
    throw new Error("Bookings are available Monday to Friday only");
  }
  if (date < getSgtDateKey()) {
    throw new Error("Booking date cannot be in the past");
  }
  return date;
}

function parseBookingDates(value: unknown, fallbackSingleDate?: unknown) {
  if (Array.isArray(value)) {
    const parsed = Array.from(new Set(value.map((item) => parseDate(item)))).sort((a, b) =>
      a.localeCompare(b),
    );
    if (!parsed.length) throw new Error("At least one booking date is required");
    return parsed;
  }
  if (fallbackSingleDate !== undefined && fallbackSingleDate !== null) {
    return [parseDate(fallbackSingleDate)];
  }
  if (value !== undefined && value !== null) {
    return [parseDate(value)];
  }
  throw new Error("At least one booking date is required");
}

function parseMonth(value: unknown) {
  const month = requiredText(value, "Month", 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Month must use YYYY-MM format");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Month is invalid");
  }
  return month;
}

function parseEndTime(value: unknown) {
  const endTime = requiredText(value, "End time", 5);
  if (!CLASSROOM_BOOKING_END_TIMES.includes(endTime as (typeof CLASSROOM_BOOKING_END_TIMES)[number])) {
    throw new Error("End time must be 18:00, 19:00, or 20:00");
  }
  return endTime;
}

function parseEmail(value: unknown) {
  const email = requiredText(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email is invalid");
  return email;
}

function parsePhone(value: unknown) {
  const phone = requiredText(value, "Phone", 40);
  if (phone.replace(/\D/g, "").length < 7) throw new Error("Phone is invalid");
  return phone;
}

function parseOptionalText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseUtm(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key, item]) =>
          /^utm_(source|medium|campaign|term|content)$/.test(key) &&
          typeof item === "string",
      )
      .map(([key, item]) => [key, String(item).slice(0, 200)]),
  );
}

function currentMonthKey() {
  return getSgtDateKey().slice(0, 7);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const classroom = parseClassroom(searchParams.get("classroom") ?? "classroom_1");
    const month = parseMonth(searchParams.get("month") ?? currentMonthKey());
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("classroom_rentals")
      .select("booking_date")
      .eq("classroom", classroom)
      .in("status", CLASSROOM_ACTIVE_STATUSES)
      .gte("booking_date", startDate)
      .lte("booking_date", endDate);
    if (error) throw new Error(error.message);

    const bookedDates = Array.from(
      new Set((data ?? []).map((item) => item.booking_date as string).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ classroom, month, bookedDates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check availability";
    return responseError(message, 400);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    // Basic bot trap, returning a success response without creating a booking.
    if (typeof body.website === "string" && body.website.trim()) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    const sourceUrl = parseOptionalText(body.sourceUrl, 2_000);
    if (sourceUrl) {
      try {
        new URL(sourceUrl);
      } catch {
        throw new Error("Source URL is invalid");
      }
    }

    const supabase = createAdminClient();
    const bookingDates = parseBookingDates(body.bookingDates, body.bookingDate);
    const { data, error } = await supabase.rpc("submit_classroom_rentals", {
      p_classroom: parseClassroom(body.classroom),
      p_booking_dates: bookingDates,
      p_end_time: parseEndTime(body.endTime ?? "18:00"),
      p_full_name: requiredText(body.fullName, "Name", 120),
      p_email: parseEmail(body.email),
      p_phone: parsePhone(body.phone),
      p_company: parseOptionalText(body.company, 200),
      p_purpose: parseOptionalText(body.purpose, 500),
      p_notes: parseOptionalText(body.notes, 500),
      p_source_url: sourceUrl,
      p_referrer: parseOptionalText(body.referrer, 2_000),
      p_utm: parseUtm(body.utm),
    });

    if (error || !data?.[0]?.booking_group_id) {
      const message = error?.message || "Unable to create booking";
      const lower = message.toLowerCase();
      if (lower.includes("already booked") || lower.includes("duplicate")) {
        return responseError(
          "One or more selected dates are already booked for this classroom",
          409,
        );
      }
      throw new Error(message);
    }

    return NextResponse.json(
      {
        bookingGroupId: data[0].booking_group_id,
        classroomRentalIds: data[0].rental_ids ?? [],
        bookedCount: bookingDates.length,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create booking";
    const status =
      message.includes("required") ||
      message.includes("invalid") ||
      message.includes("must") ||
      message.includes("Monday to Friday")
        ? 400
        : 500;
    return responseError(message, status);
  }
}
