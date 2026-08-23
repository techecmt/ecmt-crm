"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Inbox,
  LayoutGrid,
  RefreshCw,
  Search,
  Sparkles,
  UserRoundX,
  X,
} from "lucide-react";

import { CallbackRequestsCalendarView } from "@/components/callback-requests/callback-requests-calendar-view";
import { CallbackRequestCard } from "@/components/callback-requests/callback-request-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallbackRequests } from "@/lib/hooks/use-callback-requests";
import { useNowMs } from "@/lib/hooks/use-now";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  matchesQuickFilter,
  summariseRequests,
  type QuickFilter,
} from "@/lib/callback-requests-view";
import { getSgtDateKey } from "@/lib/timezone";
import {
  CALLBACK_REQUEST_STATUS_LABELS,
  CALLBACK_REQUEST_TYPE_LABELS,
  isAssignableCounsellor,
  type CallbackRequestStatus,
  type CallbackRequestType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "all";

export function CallbackRequestsPageClient() {
  const [status, setStatus] = React.useState<CallbackRequestStatus | "all">(ALL);
  const [requestType, setRequestType] = React.useState<CallbackRequestType | "all">(ALL);
  const [assignedCounsellor, setAssignedCounsellor] = React.useState<
    string | "all" | "unassigned"
  >(ALL);
  const [quickFilter, setQuickFilter] = React.useState<QuickFilter>(ALL);
  const [view, setView] = React.useState<"calendar" | "list">("calendar");
  const [search, setSearch] = React.useState("");

  // Everything is filtered on the client so the triage counts stay honest
  // regardless of which filters happen to be active.
  const { data: requests, isLoading, isFetching, error, refetch } = useCallbackRequests();
  const { data: profiles = [] } = useProfiles();
  const assignableCounsellors = React.useMemo(
    () => profiles.filter(isAssignableCounsellor),
    [profiles],
  );

  const nowMs = useNowMs();
  const todayKey = getSgtDateKey(nowMs || Date.now());
  const allRequests = React.useMemo(() => requests ?? [], [requests]);
  const summary = React.useMemo(
    () => summariseRequests(allRequests, nowMs, todayKey),
    [allRequests, nowMs, todayKey],
  );

  const visibleRequests = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRequests.filter((request) => {
      if (status !== ALL && request.status !== status) return false;
      if (requestType !== ALL && request.request_type !== requestType) return false;
      if (assignedCounsellor === "unassigned" && request.assigned_counsellor) return false;
      if (
        assignedCounsellor !== ALL &&
        assignedCounsellor !== "unassigned" &&
        request.assigned_counsellor !== assignedCounsellor
      ) {
        return false;
      }
      if (!matchesQuickFilter(request, quickFilter, nowMs, todayKey)) return false;
      if (!term) return true;
      return [
        request.full_name,
        request.email,
        request.phone,
        request.course,
        request.lead?.full_name,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [
    allRequests,
    assignedCounsellor,
    nowMs,
    quickFilter,
    requestType,
    search,
    status,
    todayKey,
  ]);

  const hasActiveFilters =
    search.trim() !== "" ||
    status !== ALL ||
    requestType !== ALL ||
    assignedCounsellor !== ALL ||
    quickFilter !== ALL;

  const clearFilters = () => {
    setSearch("");
    setStatus(ALL);
    setRequestType(ALL);
    setAssignedCounsellor(ALL);
    setQuickFilter(ALL);
  };

  const toggleQuickFilter = (next: QuickFilter) =>
    setQuickFilter((current) => (current === next ? ALL : next));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Callbacks &amp; appointments</h1>
          <p className="text-sm text-muted-foreground">
            Assign, confirm, and complete website callback and appointment requests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Refresh requests"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TriageTile
          label="Today"
          value={summary.today}
          hint={`${summary.total} in total`}
          icon={<CalendarDays className="h-4 w-4" />}
          tone="neutral"
          active={quickFilter === "today"}
          onClick={() => toggleQuickFilter("today")}
        />
        <TriageTile
          label="Overdue"
          value={summary.overdue}
          hint="Slot passed, still open"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="rose"
          active={quickFilter === "overdue"}
          onClick={() => toggleQuickFilter("overdue")}
        />
        <TriageTile
          label="Unassigned"
          value={summary.unassigned}
          hint="No counsellor yet"
          icon={<UserRoundX className="h-4 w-4" />}
          tone="amber"
          active={quickFilter === "unassigned"}
          onClick={() => toggleQuickFilter("unassigned")}
        />
        <TriageTile
          label="New"
          value={summary.unhandled}
          hint="Not yet actioned"
          icon={<Sparkles className="h-4 w-4" />}
          tone="blue"
          active={quickFilter === "new"}
          onClick={() => toggleQuickFilter("new")}
        />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 pr-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by student, email, phone, course, or lead"
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
            value={requestType}
            onValueChange={(value) => setRequestType(value as CallbackRequestType | "all")}
          >
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {(Object.keys(CALLBACK_REQUEST_TYPE_LABELS) as CallbackRequestType[]).map(
                (value) => (
                  <SelectItem key={value} value={value}>
                    {CALLBACK_REQUEST_TYPE_LABELS[value]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Select
            value={assignedCounsellor}
            onValueChange={(value) => setAssignedCounsellor(value)}
          >
            <SelectTrigger className="h-9 w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All counsellors</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignableCounsellors.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as CallbackRequestStatus | "all")}
          >
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {(Object.keys(CALLBACK_REQUEST_STATUS_LABELS) as CallbackRequestStatus[]).map(
                (value) => (
                  <SelectItem key={value} value={value}>
                    {CALLBACK_REQUEST_STATUS_LABELS[value]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
              <X className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load requests: {error.message}
        </div>
      ) : allRequests.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="mb-3 h-8 w-8 text-muted-foreground" />}
          title="No requests yet"
          description="Website callback and appointment submissions will appear here automatically."
        />
      ) : visibleRequests.length === 0 ? (
        <EmptyState
          icon={<Inbox className="mb-3 h-8 w-8 text-muted-foreground" />}
          title="No requests match these filters"
          description="Try a different counsellor, status, or search term."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : view === "calendar" ? (
        <CallbackRequestsCalendarView requests={visibleRequests} profiles={profiles} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Showing {visibleRequests.length} of {summary.total} requests
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleRequests.map((request) => (
              <CallbackRequestCard
                key={request.id}
                request={request}
                profiles={profiles}
                showLeadLink
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "calendar" | "list";
  onChange: (view: "calendar" | "list") => void;
}) {
  const options = [
    { value: "calendar" as const, label: "Calendar", icon: CalendarDays },
    { value: "list" as const, label: "List", icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const active = view === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[5px] px-3 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const TILE_TONES = {
  neutral: "text-foreground",
  rose: "text-rose-600 dark:text-rose-400",
  amber: "text-amber-600 dark:text-amber-400",
  blue: "text-blue-600 dark:text-blue-400",
} as const;

function TriageTile({
  label,
  value,
  hint,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone: keyof typeof TILE_TONES;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "cursor-pointer transition-all hover:border-foreground/20 hover:shadow-sm",
        active && "border-foreground/40 bg-muted/50 ring-1 ring-foreground/10",
      )}
    >
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", TILE_TONES[tone])}>
            {value}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted",
            TILE_TONES[tone],
          )}
        >
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
