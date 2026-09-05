"use client";

import * as React from "react";
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import {
  CLASSROOM_RENTAL_STATUS_VALUES,
  CLASSROOM_VALUES,
  dateFromKey,
  dateKeyFromDate,
  formatDayHeading,
  formatTimeLabel,
  isPastDateKey,
} from "@/lib/classroom-rentals";
import {
  useClassroomRentals,
  useUpdateClassroomRental,
  type ClassroomRentalWithRelations,
} from "@/lib/hooks/use-classroom-rentals";
import {
  CLASSROOM_LABELS,
  CLASSROOM_RENTAL_STATUS_LABELS,
  type ClassroomRentalStatus,
  type ClassroomType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const ALL = "all";

const STATUS_BADGES: Record<ClassroomRentalStatus, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  completed: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

const MODIFIER_CLASS = {
  booked: "relative after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-blue-500",
  full: "relative [&>button]:font-semibold after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-emerald-500",
  past: "text-muted-foreground opacity-60",
};

export function ClassroomRentalsPageClient() {
  const [classroom, setClassroom] = React.useState<ClassroomType | "all">(ALL);
  const [status, setStatus] = React.useState<ClassroomRentalStatus | "all">(ALL);
  const [search, setSearch] = React.useState("");
  const [month, setMonth] = React.useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const [noteDrafts, setNoteDrafts] = React.useState<Record<string, string>>({});
  const hasPinnedDate = React.useRef(false);

  const { data: rentals, isLoading, isFetching, error, refetch } = useClassroomRentals({
    classroom,
    status,
  });
  const updateRental = useUpdateClassroomRental();

  const visibleRentals = React.useMemo(() => {
    const all = rentals ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((item) =>
      [item.full_name, item.email, item.phone, item.company, item.purpose]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [rentals, search]);

  const groupedByDate = React.useMemo(() => {
    const grouped = new Map<string, ClassroomRentalWithRelations[]>();
    for (const rental of visibleRentals) {
      const list = grouped.get(rental.booking_date) ?? [];
      list.push(rental);
      grouped.set(rental.booking_date, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => {
        if (a.classroom !== b.classroom) return a.classroom.localeCompare(b.classroom);
        if (a.end_time !== b.end_time) return a.end_time.localeCompare(b.end_time);
        return a.full_name.localeCompare(b.full_name);
      });
    }
    return grouped;
  }, [visibleRentals]);

  const dateKeys = React.useMemo(
    () => Array.from(groupedByDate.keys()).sort((a, b) => a.localeCompare(b)),
    [groupedByDate],
  );

  const defaultDate = React.useMemo(() => {
    const today = dateKeyFromDate(new Date());
    if (groupedByDate.has(today)) return today;
    return dateKeys.find((key) => key >= today) ?? dateKeys[0] ?? today;
  }, [dateKeys, groupedByDate]);

  React.useEffect(() => {
    if (hasPinnedDate.current) return;
    setSelectedDate(dateFromKey(defaultDate));
    setMonth(dateFromKey(defaultDate));
  }, [defaultDate]);

  const selectedDateKey = dateKeyFromDate(selectedDate);
  const selectedDayRentals = React.useMemo(
    () => groupedByDate.get(selectedDateKey) ?? [],
    [groupedByDate, selectedDateKey],
  );

  const bookedDates = React.useMemo(() => dateKeys.map((key) => dateFromKey(key)), [dateKeys]);

  const fullyBookedDates = React.useMemo(() => {
    const values: Date[] = [];
    for (const [dateKey, dayRentals] of groupedByDate.entries()) {
      const occupied = new Set(
        dayRentals.filter((item) => item.status !== "cancelled").map((item) => item.classroom),
      );
      if (occupied.size >= CLASSROOM_VALUES.length) {
        values.push(dateFromKey(dateKey));
      }
    }
    return values;
  }, [groupedByDate]);

  const saveNotes = async (rental: ClassroomRentalWithRelations) => {
    const next = noteDrafts[rental.id] ?? rental.internal_notes ?? "";
    await updateRental.mutateAsync({
      rentalId: rental.id,
      patch: { internalNotes: next },
    });
  };

  const summary = React.useMemo(() => {
    const all = rentals ?? [];
    return {
      total: all.length,
      new: all.filter((item) => item.status === "new").length,
      confirmed: all.filter((item) => item.status === "confirmed").length,
      completed: all.filter((item) => item.status === "completed").length,
    };
  }, [rentals]);

  const goToDate = (date: Date) => {
    hasPinnedDate.current = true;
    setSelectedDate(date);
    setMonth(date);
  };

  const clearFilters = () => {
    setClassroom(ALL);
    setStatus(ALL);
    setSearch("");
  };

  const hasFilters = classroom !== ALL || status !== ALL || search.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Classroom rentals</h1>
          <p className="text-sm text-muted-foreground">
            Manage customer bookings by classroom and date.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label="Refresh rentals"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Total bookings" value={summary.total} />
        <SummaryTile label="New" value={summary.new} tone="blue" />
        <SummaryTile label="Confirmed" value={summary.confirmed} tone="green" />
        <SummaryTile label="Completed" value={summary.completed} tone="slate" />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 pr-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by customer, phone, email, company, or purpose"
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={classroom}
            onValueChange={(value) => setClassroom(value as ClassroomType | "all")}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All classrooms</SelectItem>
              {CLASSROOM_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {CLASSROOM_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(value) => setStatus(value as ClassroomRentalStatus | "all")}>
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {CLASSROOM_RENTAL_STATUS_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {CLASSROOM_RENTAL_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters ? (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
              <X className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load bookings: {error.message}
        </div>
      ) : visibleRentals.length === 0 ? (
        <EmptyState
          title="No bookings found"
          description="New bookings from the classroom rental page will appear here."
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(value) => value && goToDate(value)}
                month={month}
                onMonthChange={setMonth}
                weekStartsOn={1}
                modifiers={{
                  booked: bookedDates,
                  full: fullyBookedDates,
                  past: bookedDates.filter((date) => isPastDateKey(dateKeyFromDate(date))),
                }}
                modifiersClassNames={{
                  booked: MODIFIER_CLASS.booked,
                  full: MODIFIER_CLASS.full,
                  past: MODIFIER_CLASS.past,
                }}
                className="mx-auto w-fit p-0"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                <LegendDot className="bg-blue-500" label="Has bookings" />
                <LegendDot className="bg-emerald-500" label="All classrooms booked" />
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="gap-3 space-y-0 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">{formatDayHeading(selectedDate)}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedDayRentals.length === 0
                    ? "No bookings on this day"
                    : `${selectedDayRentals.length} booking${selectedDayRentals.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Previous day"
                  onClick={() => goToDate(addDays(selectedDate, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => goToDate(new Date())}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Next day"
                  onClick={() => goToDate(addDays(selectedDate, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {selectedDayRentals.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                  <CalendarCheck2 className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No classroom bookings here</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Select a highlighted date from the calendar to manage bookings.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {selectedDayRentals.map((rental) => {
                    const draft = noteDrafts[rental.id] ?? rental.internal_notes ?? "";
                    return (
                      <li key={rental.id} className="space-y-3 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{rental.full_name}</p>
                              <Badge variant="outline">{CLASSROOM_LABELS[rental.classroom]}</Badge>
                              <Badge
                                variant="secondary"
                                className={cn("border-0", STATUS_BADGES[rental.status])}
                              >
                                {CLASSROOM_RENTAL_STATUS_LABELS[rental.status]}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {rental.phone} · {rental.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTimeLabel(rental.start_time)} to {formatTimeLabel(rental.end_time)}
                            </p>
                          </div>
                          <Select
                            value={rental.status}
                            onValueChange={(value) =>
                              updateRental.mutate({
                                rentalId: rental.id,
                                patch: { status: value as ClassroomRentalStatus },
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CLASSROOM_RENTAL_STATUS_VALUES.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {CLASSROOM_RENTAL_STATUS_LABELS[value]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {rental.company || rental.purpose || rental.notes ? (
                          <div className="rounded-md bg-muted/40 p-3 text-sm">
                            {rental.company ? (
                              <p>
                                <span className="font-medium">Company:</span> {rental.company}
                              </p>
                            ) : null}
                            {rental.purpose ? (
                              <p>
                                <span className="font-medium">Purpose:</span> {rental.purpose}
                              </p>
                            ) : null}
                            {rental.notes ? (
                              <p>
                                <span className="font-medium">Customer notes:</span> {rental.notes}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          <Label htmlFor={`notes-${rental.id}`} className="text-xs text-muted-foreground">
                            Internal notes
                          </Label>
                          <Textarea
                            id={`notes-${rental.id}`}
                            rows={3}
                            value={draft}
                            onChange={(event) =>
                              setNoteDrafts((current) => ({
                                ...current,
                                [rental.id]: event.target.value,
                              }))
                            }
                            placeholder="Add internal context for follow-up, invoicing, or handover."
                          />
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateRental.isPending || draft.trim() === (rental.internal_notes ?? "").trim()}
                              onClick={() => void saveNotes(rental)}
                            >
                              Save notes
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "blue" | "green" | "slate";
}) {
  const toneClass =
    tone === "blue"
      ? "text-blue-600 dark:text-blue-300"
      : tone === "green"
        ? "text-emerald-600 dark:text-emerald-300"
        : tone === "slate"
          ? "text-slate-600 dark:text-slate-300"
          : "text-foreground";

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
      <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
