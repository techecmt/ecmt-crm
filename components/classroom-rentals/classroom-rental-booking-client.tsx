"use client";

import * as React from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import {
  CLASSROOM_BOOKING_END_TIMES,
  CLASSROOM_BOOKING_START_TIME,
  CLASSROOM_VALUES,
  dateFromKey,
  dateKeyFromDate,
  formatShortDay,
  formatTimeLabel,
  isPastDateKey,
  isWeekdayDate,
  monthKeyFromDate,
} from "@/lib/classroom-rentals";
import { CLASSROOM_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  purpose: string;
  notes: string;
  endTime: string;
  website: string;
};

const DEFAULT_FORM: FormState = {
  fullName: "",
  email: "",
  phone: "",
  company: "",
  purpose: "",
  notes: "",
  endTime: "18:00",
  website: "",
};

const BOOKED_DAY_CLASS =
  "relative [&>button]:line-through [&>button]:text-muted-foreground after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-rose-500";

export function ClassroomRentalBookingClient() {
  const [classroom, setClassroom] = React.useState(CLASSROOM_VALUES[0]);
  const [month, setMonth] = React.useState<Date>(new Date());
  const [selectedDates, setSelectedDates] = React.useState<Date[]>([]);
  const [bookedDates, setBookedDates] = React.useState<string[]>([]);
  const [loadingDates, setLoadingDates] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(DEFAULT_FORM);
  const [confirmation, setConfirmation] = React.useState<{
    bookingGroupId: string;
    bookedCount: number;
  } | null>(null);

  const monthKey = React.useMemo(() => monthKeyFromDate(month), [month]);
  const bookedDateSet = React.useMemo(() => new Set(bookedDates), [bookedDates]);
  const bookedDateObjects = React.useMemo(() => bookedDates.map((key) => dateFromKey(key)), [bookedDates]);

  const loadAvailability = React.useCallback(async () => {
    setLoadingDates(true);
    try {
      const response = await fetch(
        `/api/public/classroom-rentals?classroom=${classroom}&month=${monthKey}`,
      );
      const payload = (await response.json()) as { bookedDates?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to fetch availability");
      setBookedDates(payload.bookedDates ?? []);
    } catch (error) {
      setBookedDates([]);
      toast.error(error instanceof Error ? error.message : "Unable to fetch availability");
    } finally {
      setLoadingDates(false);
    }
  }, [classroom, monthKey]);

  React.useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  React.useEffect(() => {
    if (!selectedDates.length) return;
    setSelectedDates((current) =>
      current.filter((date) => {
        const key = dateKeyFromDate(date);
        return !bookedDateSet.has(key) && isWeekdayDate(date) && !isPastDateKey(key);
      }),
    );
  }, [bookedDateSet, selectedDates.length]);

  const selectedDateKeys = React.useMemo(
    () =>
      Array.from(new Set(selectedDates.map((date) => dateKeyFromDate(date)))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [selectedDates],
  );

  const disabledDate = (date: Date) => {
    const key = dateKeyFromDate(date);
    return !isWeekdayDate(date) || bookedDateSet.has(key) || isPastDateKey(key);
  };

  const onChange = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDateKeys.length) {
      toast.error("Please choose one or more available weekdays for your booking.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/public/classroom-rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroom,
          bookingDates: selectedDateKeys,
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          company: form.company,
          purpose: form.purpose,
          notes: form.notes,
          endTime: form.endTime,
          sourceUrl: window.location.href,
          referrer: document.referrer,
          preferredTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          website: form.website,
        }),
      });

      const payload = (await response.json()) as {
        bookingGroupId?: string;
        bookedCount?: number;
        error?: string;
      };
      if (!response.ok || !payload.bookingGroupId) {
        throw new Error(payload.error || "Unable to submit booking");
      }

      setConfirmation({
        bookingGroupId: payload.bookingGroupId,
        bookedCount: payload.bookedCount ?? selectedDateKeys.length,
      });
      setForm(DEFAULT_FORM);
      setSelectedDates([]);
      await loadAvailability();
      toast.success("Classroom booking submitted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit booking");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Classroom rental booking</h1>
        <p className="text-sm text-muted-foreground">
          Book Classroom 1, 2, or 3 for a full weekday slot from 9:00 AM to 6:00 PM,
          with optional extension up to 8:00 PM.
        </p>
      </div>

      {confirmation ? (
        <Card className="border-emerald-300 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/40">
          <CardContent className="flex items-start gap-3 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Booking submitted successfully for {confirmation.bookedCount} date
                {confirmation.bookedCount === 1 ? "" : "s"}.
              </p>
              <p className="text-xs text-muted-foreground">
                Reference ID: <span className="font-mono">{confirmation.bookingGroupId}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Choose classroom &amp; date</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="classroom">Classroom</Label>
              <Select value={classroom} onValueChange={(value) => setClassroom(value as (typeof CLASSROOM_VALUES)[number])}>
                <SelectTrigger id="classroom">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASSROOM_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CLASSROOM_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Calendar
              mode="multiple"
              selected={selectedDates}
              onSelect={(value) => setSelectedDates(value ?? [])}
              month={month}
              onMonthChange={setMonth}
              weekStartsOn={1}
              disabled={disabledDate}
              modifiers={{ booked: bookedDateObjects }}
              modifiersClassNames={{ booked: BOOKED_DAY_CLASS }}
              className="mx-auto w-fit p-0"
            />

            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <p>Monday to Friday only. Weekends and already-booked dates are blocked.</p>
              <p className="mt-1">
                {loadingDates
                  ? "Checking availability..."
                  : `${bookedDates.length} booked date${bookedDates.length === 1 ? "" : "s"} in ${classroom.replace("_", " ").toUpperCase()} this month.`}
              </p>
              <p className="mt-1">You can choose multiple dates in one booking.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer details</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(event) => onChange("fullName", event.target.value)}
                    required
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(event) => onChange("phone", event.target.value)}
                    required
                    maxLength={40}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => onChange("email", event.target.value)}
                    required
                    maxLength={254}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company">Company (optional)</Label>
                  <Input
                    id="company"
                    value={form.company}
                    onChange={(event) => onChange("company", event.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bookingTime">Booking slot</Label>
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatTimeLabel(CLASSROOM_BOOKING_START_TIME)} to</span>
                    <Select
                      value={form.endTime}
                      onValueChange={(value) => onChange("endTime", value)}
                    >
                      <SelectTrigger
                        id="bookingTime"
                        className="h-8 w-28 border-0 bg-transparent px-0 text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASSROOM_BOOKING_END_TIMES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {formatTimeLabel(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Selected dates ({selectedDateKeys.length})</Label>
                  <div className="min-h-10 rounded-md border px-3 py-2 text-sm">
                    {selectedDateKeys.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedDateKeys.map((dateKey) => (
                          <Badge key={dateKey} variant="secondary">
                            {formatShortDay(dateFromKey(dateKey))}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select one or more available weekdays</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="purpose">Purpose (optional)</Label>
                <Textarea
                  id="purpose"
                  rows={3}
                  value={form.purpose}
                  onChange={(event) => onChange("purpose", event.target.value)}
                  maxLength={500}
                  placeholder="Tell us what this classroom booking is for."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Additional notes (optional)</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={form.notes}
                  onChange={(event) => onChange("notes", event.target.value)}
                  maxLength={500}
                />
              </div>

              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) => onChange("website", event.target.value)}
                className="hidden"
                aria-hidden="true"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="outline">
                  {selectedDateKeys.length || 0} date{selectedDateKeys.length === 1 ? "" : "s"} selected
                </Badge>
                <Button type="submit" disabled={submitting || !selectedDateKeys.length}>
                  {submitting ? "Submitting..." : "Book classroom dates"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
