"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquareText,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AppointmentModeIcon,
  CounsellorPicker,
  OverdueBadge,
  QuickContactActions,
  RequestTypeBadge,
  StatusPicker,
  UNASSIGNED,
  appointmentModeLabel,
  counsellorLabel,
} from "@/components/callback-requests/request-controls";
import {
  useBulkUpdateCallbackRequests,
  useCallbackRequestPatch,
  type CallbackRequestWithRelations,
} from "@/lib/hooks/use-callback-requests";
import { useNowMs } from "@/lib/hooks/use-now";
import {
  TYPE_RAIL_STYLES,
  addDays,
  dateFromKey,
  dateKeyFromDate,
  formatDayHeading,
  formatEndTimeLabel,
  formatShortDay,
  formatTimeLabel,
  isOverdueRequest,
  relativeDayLabel,
} from "@/lib/callback-requests-view";
import { getSgtDateKey } from "@/lib/timezone";
import {
  CALLBACK_REQUEST_STATUS_LABELS,
  isAssignableCounsellor,
  type CallbackRequestStatus,
  type Profile,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type DayTone = "overdue" | "appointment" | "callback";

const DAY_DOT_BASE =
  "relative [&>button]:font-semibold after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full";

const DAY_DOT_CLASSES: Record<DayTone, string> = {
  callback: `${DAY_DOT_BASE} after:bg-blue-500`,
  appointment: `${DAY_DOT_BASE} after:bg-emerald-500`,
  overdue: `${DAY_DOT_BASE} after:bg-rose-500`,
};

export function CallbackRequestsCalendarView({
  requests,
  profiles,
}: {
  requests: CallbackRequestWithRelations[];
  profiles: Profile[];
}) {
  const nowMs = useNowMs();
  const todayKey = getSgtDateKey(nowMs || Date.now());
  const patchRequest = useCallbackRequestPatch();
  const bulkUpdate = useBulkUpdateCallbackRequests();

  const assignableCounsellors = React.useMemo(
    () => profiles.filter(isAssignableCounsellor),
    [profiles],
  );

  const groupedByDate = React.useMemo(() => {
    const grouped = new Map<string, CallbackRequestWithRelations[]>();
    for (const request of requests) {
      const list = grouped.get(request.preferred_date) ?? [];
      list.push(request);
      grouped.set(request.preferred_date, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => {
        if (a.preferred_time !== b.preferred_time) {
          return a.preferred_time.localeCompare(b.preferred_time);
        }
        return a.full_name.localeCompare(b.full_name);
      });
    }
    return grouped;
  }, [requests]);

  const availableDateKeys = React.useMemo(
    () => Array.from(groupedByDate.keys()).sort((a, b) => a.localeCompare(b)),
    [groupedByDate],
  );

  /** Prefer today, then the next day that has something on it. */
  const preferredDateKey = React.useMemo(() => {
    if (groupedByDate.has(todayKey)) return todayKey;
    return (
      availableDateKeys.find((key) => key >= todayKey) ??
      availableDateKeys[availableDateKeys.length - 1] ??
      todayKey
    );
  }, [availableDateKeys, groupedByDate, todayKey]);

  const [selectedDate, setSelectedDate] = React.useState<Date>(() =>
    dateFromKey(preferredDateKey),
  );
  const [month, setMonth] = React.useState<Date>(() => dateFromKey(preferredDateKey));
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [openNotesId, setOpenNotesId] = React.useState<string | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  const hasPinnedDate = React.useRef(false);

  // Only auto-jump before the user has picked a day themselves.
  React.useEffect(() => {
    if (hasPinnedDate.current) return;
    const next = dateFromKey(preferredDateKey);
    setSelectedDate(next);
    setMonth(next);
  }, [preferredDateKey]);

  const selectedDateKey = dateKeyFromDate(selectedDate);
  const selectedDayRequests = React.useMemo(
    () => groupedByDate.get(selectedDateKey) ?? [],
    [groupedByDate, selectedDateKey],
  );

  React.useEffect(() => {
    setSelectedIds([]);
    setOpenNotesId(null);
  }, [selectedDateKey]);

  // Drop selected ids that fell out of the current result set.
  React.useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => selectedDayRequests.some((request) => request.id === id)),
    );
  }, [selectedDayRequests]);

  const goToDate = (date: Date) => {
    hasPinnedDate.current = true;
    setSelectedDate(date);
    setMonth(date);
  };

  const dayTones = React.useMemo(() => {
    const tones = new Map<string, DayTone>();
    for (const [dateKey, list] of groupedByDate) {
      const hasOverdue = list.some((request) => isOverdueRequest(request, nowMs));
      const hasAppointment = list.some((request) => request.request_type === "appointment");
      tones.set(dateKey, hasOverdue ? "overdue" : hasAppointment ? "appointment" : "callback");
    }
    return tones;
  }, [groupedByDate, nowMs]);

  const modifierDates = React.useMemo(() => {
    const byTone: Record<DayTone, Date[]> = { overdue: [], appointment: [], callback: [] };
    for (const [dateKey, tone] of dayTones) {
      byTone[tone].push(dateFromKey(dateKey));
    }
    return byTone;
  }, [dayTones]);

  const upcomingDays = React.useMemo(
    () =>
      availableDateKeys
        .filter((key) => key >= todayKey && key !== selectedDateKey)
        .slice(0, 5)
        .map((key) => ({
          key,
          count: groupedByDate.get(key)?.length ?? 0,
          tone: dayTones.get(key) ?? "callback",
        })),
    [availableDateKeys, dayTones, groupedByDate, selectedDateKey, todayKey],
  );

  const selectedRequests = React.useMemo(
    () => selectedDayRequests.filter((request) => selectedIds.includes(request.id)),
    [selectedDayRequests, selectedIds],
  );

  const allSelected =
    selectedDayRequests.length > 0 && selectedIds.length === selectedDayRequests.length;

  const dayAppointments = selectedDayRequests.filter(
    (request) => request.request_type === "appointment",
  ).length;

  const applyBulk = (patch: { status?: CallbackRequestStatus; assignedCounsellor?: string | null }) => {
    if (!selectedRequests.length) return;
    bulkUpdate.mutate({
      updates: selectedRequests.map((request) => ({ request, patch })),
    });
    setSelectedIds([]);
  };

  // Only the row currently saving is locked, so edits elsewhere stay responsive.
  const pendingId = patchRequest.isPending ? patchRequest.variables?.request.id : null;

  const relativeLabel = relativeDayLabel(selectedDateKey, todayKey);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
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
                  hasCallback: modifierDates.callback,
                  hasAppointment: modifierDates.appointment,
                  hasOverdue: modifierDates.overdue,
                }}
                modifiersClassNames={{
                  hasCallback: DAY_DOT_CLASSES.callback,
                  hasAppointment: DAY_DOT_CLASSES.appointment,
                  hasOverdue: DAY_DOT_CLASSES.overdue,
                }}
                className="mx-auto w-fit p-0"
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                <LegendDot className="bg-emerald-500" label="Appointment" />
                <LegendDot className="bg-blue-500" label="Callback" />
                <LegendDot className="bg-rose-500" label="Overdue" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Coming up
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {upcomingDays.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing else scheduled in this result.
                </p>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {upcomingDays.map((day) => (
                    <li key={day.key}>
                      <button
                        type="button"
                        onClick={() => goToDate(dateFromKey(day.key))}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            day.tone === "overdue"
                              ? "bg-rose-500"
                              : day.tone === "appointment"
                                ? "bg-emerald-500"
                                : "bg-blue-500",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {relativeDayLabel(day.key, todayKey) ?? formatShortDay(dateFromKey(day.key))}
                        </span>
                        <span className="text-xs text-muted-foreground">{day.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader className="gap-3 space-y-0 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{formatDayHeading(selectedDate)}</CardTitle>
                {relativeLabel ? (
                  <Badge variant="secondary" className="border-0">
                    {relativeLabel}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedDayRequests.length === 0
                  ? "No requests on this day"
                  : `${selectedDayRequests.length} request${selectedDayRequests.length === 1 ? "" : "s"}${
                      dayAppointments ? ` · ${dayAppointments} appointment${dayAppointments === 1 ? "" : "s"}` : ""
                    }`}
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
                onClick={() => goToDate(dateFromKey(todayKey))}
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
            {selectedDayRequests.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                <CalendarCheck2 className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">This day is clear</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Pick another date on the calendar, or jump to the next day with requests.
                </p>
                {upcomingDays[0] ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => goToDate(dateFromKey(upcomingDays[0].key))}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Go to {relativeDayLabel(upcomingDays[0].key, todayKey) ??
                      formatShortDay(dateFromKey(upcomingDays[0].key))}
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  <Checkbox
                    checked={allSelected}
                    aria-label="Select all requests on this day"
                    onCheckedChange={(checked) =>
                      setSelectedIds(
                        checked ? selectedDayRequests.map((request) => request.id) : [],
                      )
                    }
                  />
                  {selectedRequests.length ? (
                    <>
                      <span className="text-sm font-medium">
                        {selectedRequests.length} selected
                      </span>
                      <Select
                        value=""
                        disabled={bulkUpdate.isPending}
                        onValueChange={(value) =>
                          applyBulk({ assignedCounsellor: value === UNASSIGNED ? null : value })
                        }
                      >
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <SelectValue placeholder="Assign counsellor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                          {assignableCounsellors.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.full_name || profile.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value=""
                        disabled={bulkUpdate.isPending}
                        onValueChange={(value) =>
                          applyBulk({ status: value as CallbackRequestStatus })
                        }
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue placeholder="Set status" />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.keys(CALLBACK_REQUEST_STATUS_LABELS) as CallbackRequestStatus[]
                          ).map((status) => (
                            <SelectItem key={status} value={status}>
                              {CALLBACK_REQUEST_STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setSelectedIds([])}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Clear
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Select requests to assign or update them together
                    </span>
                  )}
                </div>

                <ul className="divide-y">
                  {selectedDayRequests.map((request) => {
                    const overdue = isOverdueRequest(request, nowMs);
                    const isSelected = selectedIds.includes(request.id);
                    const notesOpen = openNotesId === request.id;
                    const endLabel = formatEndTimeLabel(
                      request.preferred_time,
                      request.duration_minutes ?? 30,
                    );
                    const isAppointment = request.request_type === "appointment";

                    return (
                      <li
                        key={request.id}
                        className={cn(
                          "relative transition-colors",
                          isSelected ? "bg-muted/60" : "hover:bg-muted/40",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute inset-y-0 left-0 w-1",
                            overdue ? "bg-rose-500" : TYPE_RAIL_STYLES[request.request_type],
                          )}
                          aria-hidden="true"
                        />
                        <div className="flex flex-col gap-3 py-3 pl-5 pr-4 lg:flex-row lg:items-start">
                          <div className="flex flex-1 items-start gap-3">
                            <Checkbox
                              className="mt-1"
                              checked={isSelected}
                              aria-label={`Select request for ${request.full_name}`}
                              onCheckedChange={(checked) =>
                                setSelectedIds((current) =>
                                  checked
                                    ? [...current, request.id]
                                    : current.filter((id) => id !== request.id),
                                )
                              }
                            />
                            <div className="w-20 shrink-0">
                              <div className="text-sm font-semibold tabular-nums">
                                {formatTimeLabel(request.preferred_time)}
                              </div>
                              {isAppointment && endLabel ? (
                                <div className="text-xs text-muted-foreground tabular-nums">
                                  to {endLabel}
                                </div>
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{request.full_name}</span>
                                <RequestTypeBadge type={request.request_type} />
                                {overdue ? <OverdueBadge /> : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <AppointmentModeIcon
                                    mode={isAppointment ? request.appointment_mode : "phone"}
                                    className="h-3.5 w-3.5"
                                  />
                                  {isAppointment
                                    ? appointmentModeLabel(request.appointment_mode)
                                    : "Callback"}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{request.course}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                <QuickContactActions
                                  phone={request.phone}
                                  email={request.email}
                                  className="-ml-2"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground",
                                    request.notes && "text-foreground",
                                  )}
                                  onClick={() => {
                                    setOpenNotesId(notesOpen ? null : request.id);
                                    setNoteDraft(request.notes ?? "");
                                  }}
                                >
                                  <MessageSquareText className="h-3.5 w-3.5" />
                                  {request.notes ? "Notes" : "Add note"}
                                </Button>
                                {request.lead_id ? (
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    <Link href={`/dashboard/leads/${request.lead_id}`}>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      Lead
                                    </Link>
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-9 lg:w-96 lg:justify-end lg:pl-0">
                            <CounsellorPicker
                              className="w-full min-w-40 sm:w-44"
                              value={request.assigned_counsellor}
                              counsellors={assignableCounsellors}
                              disabled={pendingId === request.id || bulkUpdate.isPending}
                              onChange={(counsellorId) =>
                                patchRequest.mutate({
                                  request,
                                  patch: { assignedCounsellor: counsellorId },
                                  message: counsellorId
                                    ? `Assigned to ${counsellorLabel(counsellorId, profiles)}`
                                    : "Request unassigned",
                                })
                              }
                            />
                            <StatusPicker
                              className="w-full min-w-36 sm:w-40"
                              value={request.status}
                              disabled={pendingId === request.id || bulkUpdate.isPending}
                              onChange={(status) =>
                                patchRequest.mutate({
                                  request,
                                  patch: { status },
                                  message: `Marked ${CALLBACK_REQUEST_STATUS_LABELS[status].toLowerCase()}`,
                                })
                              }
                            />
                          </div>
                        </div>

                        {notesOpen ? (
                          <div className="space-y-2 border-t bg-muted/30 px-5 py-3">
                            <Textarea
                              autoFocus
                              rows={3}
                              value={noteDraft}
                              onChange={(event) => setNoteDraft(event.target.value)}
                              placeholder={
                                isAppointment
                                  ? "Confirm the slot, meeting link, or campus details."
                                  : "Capture the callback outcome or next action."
                              }
                              className="bg-background"
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                disabled={
                                  pendingId === request.id ||
                                  noteDraft.trim() === (request.notes ?? "").trim()
                                }
                                onClick={() => {
                                  patchRequest.mutate({
                                    request,
                                    patch: { notes: noteDraft },
                                    message: "Note saved",
                                  });
                                  setOpenNotesId(null);
                                }}
                              >
                                Save note
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setOpenNotesId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : request.notes ? (
                          <p className="border-t bg-muted/20 px-5 py-2 text-xs text-muted-foreground">
                            {request.notes}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
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
