"use client";

import * as React from "react";
import Link from "next/link";
import {
  addWeeks,
  endOfWeek,
  isPast,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  ShieldCheck,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  useCompleteFollowUpTask,
  useFollowUps,
  useUpsertFollowUp,
  nextUpcomingPerLead,
  type FollowUpWithRelations,
} from "@/lib/hooks/use-follow-ups";
import { useColleges } from "@/lib/hooks/use-colleges";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  FOLLOW_UP_PRIORITY_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  isAdminRole,
  type UserRole,
} from "@/lib/types";
import { WhatsAppPhoneLink } from "@/components/phone/whatsapp-phone-link";
import { formatSgtDateTime, getSgtDateKey } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { CompleteFollowUpDialog } from "@/components/follow-ups/complete-follow-up-dialog";

type Filter = "mine" | "all";
type DatePreset = "all" | "today" | "this_week" | "last_week" | "next_week";
type DateSortOrder = "asc" | "desc";

function toDateInput(value: Date) {
  return getSgtDateKey(value);
}

export function FollowUpsPageClient({
  currentUserId,
  role,
}: {
  currentUserId: string;
  role: UserRole;
}) {
  const isAdmin = isAdminRole(role);
  const [filter, setFilter] = React.useState<Filter>(isAdmin ? "all" : "mine");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("");
  const [datePreset, setDatePreset] = React.useState<DatePreset>("all");
  const [sequenceFilter, setSequenceFilter] =
    React.useState<FollowUpFilterKey | null>(null);
  const [exactDate, setExactDate] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [dateSortOrder, setDateSortOrder] = React.useState<DateSortOrder>("asc");
  const [collegeFilter, setCollegeFilter] = React.useState<string>("");

  const assignedTo = React.useMemo(() => {
    if (!isAdmin) return "me" as const;
    if (filter === "mine") return "me" as const;
    if (assigneeFilter) return assigneeFilter;
    return undefined;
  }, [assigneeFilter, filter, isAdmin]);

  const dateRange = React.useMemo(() => {
    if (exactDate) return { fromDate: exactDate, toDate: exactDate };
    if (startDate || endDate) return { fromDate: startDate || undefined, toDate: endDate || undefined };

    const now = new Date();
    if (datePreset === "today") {
      const today = toDateInput(now);
      return { fromDate: today, toDate: today };
    }
    if (datePreset === "this_week") {
      return {
        fromDate: toDateInput(startOfWeek(now, { weekStartsOn: 1 })),
        toDate: toDateInput(endOfWeek(now, { weekStartsOn: 1 })),
      };
    }
    if (datePreset === "last_week") {
      const base = subWeeks(now, 1);
      return {
        fromDate: toDateInput(startOfWeek(base, { weekStartsOn: 1 })),
        toDate: toDateInput(endOfWeek(base, { weekStartsOn: 1 })),
      };
    }
    if (datePreset === "next_week") {
      const base = addWeeks(now, 1);
      return {
        fromDate: toDateInput(startOfWeek(base, { weekStartsOn: 1 })),
        toDate: toDateInput(endOfWeek(base, { weekStartsOn: 1 })),
      };
    }
    return { fromDate: undefined, toDate: undefined };
  }, [datePreset, endDate, exactDate, startDate]);

  const { data: followUps, isLoading } = useFollowUps({
    assignedTo,
    collegeId: collegeFilter || undefined,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
  });
  const { data: colleges } = useColleges({ activeOnly: true });
  const { data: profiles } = useProfiles();
  const complete = useCompleteFollowUpTask();
  const [completingTask, setCompletingTask] =
    React.useState<FollowUpWithRelations | null>(null);
  const [reassignTask, setReassignTask] =
    React.useState<FollowUpWithRelations | null>(null);

  const groups = React.useMemo(() => {
    const list = followUps ?? [];
    const now = new Date();
    const nextUpcoming = nextUpcomingPerLead(list);
    const matchesSequence = (f: FollowUpWithRelations) =>
      sequenceFilter == null || followUpFilterKey(f.sequence) === sequenceFilter;
    const sortedByDate = (items: FollowUpWithRelations[]) =>
      [...items].sort((a, b) => {
        const aTs = new Date(a.completed_at ?? a.scheduled_at).getTime();
        const bTs = new Date(b.completed_at ?? b.scheduled_at).getTime();
        return dateSortOrder === "asc" ? aTs - bTs : bTs - aTs;
      });
    return {
      upcoming: sortedByDate(
        nextUpcoming.filter((f) => new Date(f.scheduled_at) >= now && matchesSequence(f)),
      ),
      overdue: sortedByDate(
        nextUpcoming.filter((f) => new Date(f.scheduled_at) < now && matchesSequence(f)),
      ),
      completed: sortedByDate(
        list.filter((f) => f.status === "completed" && matchesSequence(f)),
      ),
    };
  }, [dateSortOrder, followUps, sequenceFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            Only the next upcoming follow-up per lead is shown. Complete it to
            unlock the next one in the sequence.
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="mine">My follow-ups</TabsTrigger>
                <TabsTrigger value="all">All counsellors</TabsTrigger>
              </TabsList>
            </Tabs>
            {filter === "all" ? (
              <Select
                value={assigneeFilter || "all"}
                onValueChange={(v) => setAssigneeFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue placeholder="Filter by counsellor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All counsellors</SelectItem>
                  {(profiles ?? [])
                    .filter((p) => p.is_active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ) : null}
      </div>
      <FollowUpLegend value={sequenceFilter} onChange={setSequenceFilter} />

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="grid gap-1.5 rounded-md border p-2.5">
              <label className="text-xs font-medium text-foreground">Preset</label>
              <Select
                value={datePreset}
                onValueChange={(value) => setDatePreset(value as DatePreset)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last_week">Last week</SelectItem>
                  <SelectItem value="this_week">This week</SelectItem>
                  <SelectItem value="next_week">Next week</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 rounded-md border p-2.5">
              <label className="text-xs font-medium text-foreground">Exact date</label>
              <input
                type="date"
                value={exactDate}
                onChange={(e) => setExactDate(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-base sm:text-sm"
              />
            </div>
            <div className="grid gap-1.5 rounded-md border p-2.5 md:col-span-2">
              <label className="text-xs font-medium text-foreground">Custom range</label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 rounded-md border bg-background px-3 text-base sm:text-sm"
                  aria-label="Start date"
                />
                <span className="text-center text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 rounded-md border bg-background px-3 text-base sm:text-sm"
                  aria-label="End date"
                />
              </div>
            </div>
            <div className="grid gap-1.5 rounded-md border p-2.5">
              <label className="text-xs font-medium text-foreground">Sort by date</label>
              <Select
                value={dateSortOrder}
                onValueChange={(value) => setDateSortOrder(value as DateSortOrder)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Oldest first</SelectItem>
                  <SelectItem value="desc">Newest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 rounded-md border p-2.5">
              <label className="text-xs font-medium text-foreground">College</label>
              <Select
                value={collegeFilter || "all"}
                onValueChange={(value) => setCollegeFilter(value === "all" ? "" : value)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All colleges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All colleges</SelectItem>
                  {(colleges ?? []).map((college) => (
                    <SelectItem key={college.id} value={college.id}>
                      {college.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9"
              onClick={() => {
                setDatePreset("all");
                setExactDate("");
                setStartDate("");
                setEndDate("");
                setCollegeFilter("");
              }}
            >
              Clear filters
            </Button>
            <p className="text-xs text-muted-foreground">
              Use <span className="font-medium text-foreground">Exact date</span> or a{" "}
              <span className="font-medium text-foreground">Custom range</span>.
            </p>
          </div>
        </CardContent>
      </Card>

      {!isAdmin ? (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Personal queue</AlertTitle>
          <AlertDescription>
            You are viewing only the follow-ups assigned to you.
          </AlertDescription>
        </Alert>
      ) : null}

      {groups.overdue.length > 0 ? (
        <Card className="border-destructive/40 bg-destructive/10 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="text-sm font-medium text-destructive">
                {groups.overdue.length} overdue follow-up
                {groups.overdue.length === 1 ? "" : "s"}
              </div>
              <p className="text-xs text-muted-foreground">
                Clear missed work first to keep counsellor queues healthy.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Upcoming"
          value={groups.upcoming.length}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="default"
        />
        <KpiCard
          title="Overdue"
          value={groups.overdue.length}
          icon={<Clock className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          title="Completed"
          value={groups.completed.length}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming
            {groups.upcoming.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {groups.upcoming.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="overdue">
            Overdue
            {groups.overdue.length > 0 ? (
              <Badge variant="destructive" className="ml-2">
                {groups.overdue.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <FollowUpList
            isLoading={isLoading}
            items={groups.upcoming}
            empty="No upcoming follow-ups."
            onComplete={setCompletingTask}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onReassign={isAdmin ? setReassignTask : undefined}
          />
        </TabsContent>
        <TabsContent value="overdue">
          <FollowUpList
            isLoading={isLoading}
            items={groups.overdue}
            empty="Nothing overdue. Great job!"
            onComplete={setCompletingTask}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onReassign={isAdmin ? setReassignTask : undefined}
          />
        </TabsContent>
        <TabsContent value="completed">
          <FollowUpList
            isLoading={isLoading}
            items={groups.completed}
            empty="No completed follow-ups yet."
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        </TabsContent>
      </Tabs>

      <CompleteFollowUpDialog
        task={completingTask}
        open={!!completingTask}
        isSaving={complete.isPending}
        onOpenChange={(open) => !open && setCompletingTask(null)}
        onSubmit={async (values) => {
          await complete.mutateAsync(values);
          setCompletingTask(null);
        }}
      />
      <ReassignFollowUpDialog
        task={reassignTask}
        open={!!reassignTask}
        onOpenChange={(open) => !open && setReassignTask(null)}
      />
    </div>
  );
}

/**
 * Per-sequence colours so each follow-up in the cadence is instantly
 * recognisable: #1 blue, #2 rose, #3 amber, #4 emerald, and a distinct
 * violet for manual ("Custom") follow-ups that have no sequence.
 */
type FollowUpStyle = { label: string; dot: string; badge: string; accent: string };

const FOLLOWUP_SEQUENCE_STYLES: Record<number, FollowUpStyle> = {
  1: {
    label: "Counselling #1",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    accent: "border-l-blue-400 dark:border-l-blue-500",
  },
  2: {
    label: "Counselling #2",
    dot: "bg-rose-500",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    accent: "border-l-rose-400 dark:border-l-rose-500",
  },
  3: {
    label: "Counselling #3",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    accent: "border-l-amber-400 dark:border-l-amber-500",
  },
  4: {
    label: "Counselling #4",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    accent: "border-l-emerald-400 dark:border-l-emerald-500",
  },
};

const FOLLOWUP_CUSTOM_STYLE: FollowUpStyle = {
  label: "Custom",
  dot: "bg-violet-500",
  badge:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  accent: "border-l-violet-400 dark:border-l-violet-500",
};

/** Filter key for a follow-up: its cadence number, or "custom" for manual ones. */
type FollowUpFilterKey = number | "custom";

/** Legend entries in cadence order, ending with the manual "Custom" style. */
const FOLLOWUP_LEGEND: { key: FollowUpFilterKey; style: FollowUpStyle }[] = [
  ...Object.keys(FOLLOWUP_SEQUENCE_STYLES)
    .map(Number)
    .sort((a, b) => a - b)
    .map((seq) => ({ key: seq as FollowUpFilterKey, style: FOLLOWUP_SEQUENCE_STYLES[seq] })),
  { key: "custom", style: FOLLOWUP_CUSTOM_STYLE },
];

function followUpStyle(sequence: number | null): FollowUpStyle {
  if (sequence && FOLLOWUP_SEQUENCE_STYLES[sequence]) {
    return FOLLOWUP_SEQUENCE_STYLES[sequence];
  }
  return FOLLOWUP_CUSTOM_STYLE;
}

/** Which legend bucket a follow-up falls into — mirrors followUpStyle. */
function followUpFilterKey(sequence: number | null): FollowUpFilterKey {
  if (sequence && FOLLOWUP_SEQUENCE_STYLES[sequence]) return sequence;
  return "custom";
}

function FollowUpLegend({
  value,
  onChange,
}: {
  value: FollowUpFilterKey | null;
  onChange: (value: FollowUpFilterKey | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <span className="text-xs font-medium text-muted-foreground">
        Follow-up colours:
      </span>
      {FOLLOWUP_LEGEND.map(({ key, style }) => {
        const isActive = value === key;
        return (
          <button
            key={style.label}
            type="button"
            aria-pressed={isActive}
            title={`Show only ${style.label} follow-ups`}
            onClick={() => onChange(isActive ? null : key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
              isActive
                ? "border-border bg-muted font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60",
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", style.dot)} />
            {style.label}
          </button>
        );
      })}
      {value != null ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function FollowUpList({
  items,
  empty,
  isLoading,
  onComplete,
  onReassign,
  isAdmin,
  currentUserId,
}: {
  items: FollowUpWithRelations[];
  empty: string;
  isLoading?: boolean;
  onComplete?: (task: FollowUpWithRelations) => void;
  onReassign?: (task: FollowUpWithRelations) => void;
  isAdmin: boolean;
  currentUserId: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {empty}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {items.map((f) => {
          const overdue =
            f.status === "pending" && isPast(new Date(f.scheduled_at));
          const isOwn =
            f.assigned_user_id === currentUserId ||
            f.assigned_to === currentUserId;
          const style = followUpStyle(f.sequence);
          return (
            <div
              key={f.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-l-4 p-4",
                style.accent,
                overdue ? "bg-destructive/5" : "",
              )}
            >
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {f.lead?.full_name ?? "Unknown lead"}
                    <Badge variant="outline" className="text-[10px]">
                      {FOLLOW_UP_TYPE_LABELS[f.followup_type ?? f.type]}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn("border-0 text-[10px]", style.badge)}
                    >
                      {f.sequence ? `Counselling #${f.sequence}` : "Custom"}
                    </Badge>
                    <Badge
                      variant={
                        f.priority === "high" || f.priority === "urgent"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {FOLLOW_UP_PRIORITY_LABELS[f.priority]}
                    </Badge>
                    {overdue ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Overdue
                      </Badge>
                    ) : null}
                    {isAdmin && !isOwn ? (
                      <Badge variant="outline" className="text-[10px]">
                        {f.assignee?.full_name ?? f.assignee?.email ?? "Unassigned"}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="text-[10px]">
                      {f.lead?.college?.name ?? "Unassigned college"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatSgtDateTime(f.scheduled_at)}
                    {f.lead ? (
                      <span className="ml-2">
                        <WhatsAppPhoneLink phone={f.lead.phone} />
                      </span>
                    ) : null}
                  </div>
                  {f.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground">{f.notes}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onComplete ? (
                  <Button size="sm" variant="outline" onClick={() => onComplete(f)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Complete
                  </Button>
                ) : null}
                {onReassign ? (
                  <Button size="sm" variant="ghost" onClick={() => onReassign(f)}>
                    Reassign
                  </Button>
                ) : null}
                {f.lead ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/dashboard/leads/${f.lead.id}`}>
                      Open
                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ReassignFollowUpDialog({
  task,
  open,
  onOpenChange,
}: {
  task: FollowUpWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: profiles } = useProfiles();
  const upsert = useUpsertFollowUp();
  const [assignee, setAssignee] = React.useState<string>(
    task?.assigned_user_id ?? "",
  );

  React.useEffect(() => {
    setAssignee(task?.assigned_user_id ?? "");
  }, [task]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign follow-up</DialogTitle>
          <DialogDescription>
            Pick a counsellor to take ownership of this follow-up.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Select value={assignee || "none"} onValueChange={setAssignee}>
            <SelectTrigger>
              <SelectValue placeholder="Select counsellor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Unassigned —</SelectItem>
              {(profiles ?? [])
                .filter((p) => p.is_active)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!task || upsert.isPending}
            onClick={async () => {
              if (!task) return;
              await upsert.mutateAsync({
                id: task.id,
                lead_id: task.lead_id,
                followup_type: task.followup_type ?? task.type,
                assigned_user_id: assignee === "none" ? null : assignee,
                due_date: task.due_date,
                due_time: task.due_time,
                priority: task.priority,
                remarks: task.remarks ?? task.notes ?? null,
              });
              onOpenChange(false);
            }}
          >
            {upsert.isPending ? "Saving…" : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: "default" | "warning" | "success" | "muted";
}) {
  const toneClasses = {
    default: "",
    warning: "text-amber-600",
    success: "text-green-600",
    muted: "text-muted-foreground",
  } as const;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className={toneClasses[tone]}>{icon}</span>
      </CardHeader>
      <CardContent>
        <CardDescription>
          <span className={`text-2xl font-semibold ${toneClasses[tone]}`}>
            {value}
          </span>
        </CardDescription>
      </CardContent>
    </Card>
  );
}
