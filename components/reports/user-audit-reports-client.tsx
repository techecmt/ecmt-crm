"use client";

import * as React from "react";
import {
  eachDayOfInterval,
  subDays,
} from "date-fns";
import { Activity, CalendarDays, CheckCircle2, UserCheck, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  joinFilterParts,
  ReportPrintable,
} from "@/components/reports/report-printable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type AdminReportLeadRow,
  type CrmEntryRow,
  type UserAuditEventRow,
  useUserAuditReport,
} from "@/lib/hooks/use-user-audit-report";
import {
  formatSgtDate,
  formatSgtDateTime,
  formatSgtMonthYear,
  getSgtDateKey,
  getSgtDayEndUtcIso,
  getSgtDayStartUtcIso,
  getSgtHour,
  getSgtMonthKey,
  getSgtMonthRangeUtc,
} from "@/lib/timezone";
import { LEAD_SOURCE_LABELS, type LeadSource } from "@/lib/types";

type UserSummary = {
  userId: string;
  name: string;
  crmEntries: number;
  leadsCreated: number;
  followUpsCompleted: number;
  registrations: number;
  counsellingCompleted: number;
  counsellingStarted: number;
};

type LeadRegistrationSummary = {
  groupId: string;
  groupName: string;
  leadsCreated: number;
  registeredUnpaid: number;
  regFeePaid: number;
};

function initSummary(userId: string, name: string): UserSummary {
  return {
    userId,
    name,
    crmEntries: 0,
    leadsCreated: 0,
    followUpsCompleted: 0,
    registrations: 0,
    counsellingCompleted: 0,
    counsellingStarted: 0,
  };
}

function initLeadRegistrationSummary(
  groupId: string,
  groupName: string,
): LeadRegistrationSummary {
  return {
    groupId,
    groupName,
    leadsCreated: 0,
    registeredUnpaid: 0,
    regFeePaid: 0,
  };
}

function toUserName(user: { full_name: string | null; email: string } | null | undefined) {
  if (!user) return "Unknown user";
  return user.full_name || user.email;
}

function summarizeLeads(
  leads: AdminReportLeadRow[],
  fromDate: string,
  toDate: string,
  getGroup: (lead: AdminReportLeadRow) => { id: string; name: string },
) {
  const fromIso = getSgtDayStartUtcIso(fromDate);
  const toIso = getSgtDayEndUtcIso(toDate);
  const from = fromIso ? new Date(fromIso) : new Date(`${fromDate}T00:00:00.000Z`);
  const to = toIso ? new Date(toIso) : new Date(`${toDate}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return [] as LeadRegistrationSummary[];
  }

  const inRange = (value: string | null) => {
    if (!value) return false;
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return false;
    return at >= from && at <= to;
  };

  const map = new Map<string, LeadRegistrationSummary>();
  const ensure = (lead: AdminReportLeadRow) => {
    const group = getGroup(lead);
    if (!map.has(group.id)) {
      map.set(group.id, initLeadRegistrationSummary(group.id, group.name));
    }
    return map.get(group.id)!;
  };

  for (const lead of leads) {
    const summary = ensure(lead);

    if (inRange(lead.created_at)) {
      summary.leadsCreated += 1;
    }

    if (inRange(lead.registration_completed_at)) {
      if (lead.status === "registration_unpaid") {
        summary.registeredUnpaid += 1;
      } else if (
        lead.status === "registered_paid_reg_fee" ||
        lead.status === "registered_closed"
      ) {
        summary.regFeePaid += 1;
      }
    }
  }

  return Array.from(map.values())
    .filter((row) => row.leadsCreated + row.registeredUnpaid + row.regFeePaid > 0)
    .sort((a, b) => {
      const aTotal = a.leadsCreated + a.registeredUnpaid + a.regFeePaid;
      const bTotal = b.leadsCreated + b.registeredUnpaid + b.regFeePaid;
      return bTotal - aTotal;
    });
}

function summarizeLeadsByCounsellor(leads: AdminReportLeadRow[], fromDate: string, toDate: string) {
  return summarizeLeads(leads, fromDate, toDate, (lead) => ({
    id: lead.assigned_counsellor ?? "unassigned",
    name: lead.counsellor ? toUserName(lead.counsellor) : "Unassigned",
  }));
}

function summarizeLeadsByCourse(leads: AdminReportLeadRow[], fromDate: string, toDate: string) {
  return summarizeLeads(leads, fromDate, toDate, (lead) => {
    const trimmed = (lead.interested_course ?? "").trim();
    return { id: trimmed || "unspecified", name: trimmed || "Unspecified" };
  });
}

function summarizeLeadsBySource(leads: AdminReportLeadRow[], fromDate: string, toDate: string) {
  return summarizeLeads(leads, fromDate, toDate, (lead) => ({
    id: lead.source,
    name: LEAD_SOURCE_LABELS[lead.source] ?? lead.source,
  }));
}

function summarizeByUser(events: UserAuditEventRow[], crmEntriesRange: CrmEntryRow[]) {
  const map = new Map<string, UserSummary>();

  const ensure = (userId: string | null | undefined, label: string) => {
    if (!userId) return null;
    if (!map.has(userId)) map.set(userId, initSummary(userId, label));
    return map.get(userId)!;
  };

  for (const row of crmEntriesRange) {
    const summary = ensure(row.user_id, toUserName(row.user));
    if (!summary) continue;
    summary.crmEntries += 1;
  }

  for (const row of events) {
    const summary = ensure(row.user_id, toUserName(row.user));
    if (!summary) continue;
    if (row.event_type === "lead_created") summary.leadsCreated += 1;
    if (row.event_type === "follow_up_completed") summary.followUpsCompleted += 1;
    if (row.event_type === "registration") summary.registrations += 1;
    if (row.event_type === "counselling_completed") summary.counsellingCompleted += 1;
    if (row.event_type === "counselling_started") summary.counsellingStarted += 1;
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTotal =
      a.crmEntries +
      a.leadsCreated +
      a.followUpsCompleted +
      a.registrations +
      a.counsellingCompleted +
      a.counsellingStarted;
    const bTotal =
      b.crmEntries +
      b.leadsCreated +
      b.followUpsCompleted +
      b.registrations +
      b.counsellingCompleted +
      b.counsellingStarted;
    return bTotal - aTotal;
  });
}

function buildHeatmap(entries: CrmEntryRow[], month: Date) {
  const monthRange = getSgtMonthRangeUtc(getSgtMonthKey(month));
  const days = eachDayOfInterval({
    start: monthRange ? new Date(monthRange.startIso) : month,
    end: monthRange ? new Date(monthRange.endIso) : month,
  });
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const key = `${getSgtDateKey(entry.created_at)}-${getSgtHour(entry.created_at)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const maxCount = Math.max(1, ...Array.from(counts.values()));
  return { days, hours, counts, maxCount };
}

function HeatCell({
  count,
  maxCount,
  title,
}: {
  count: number;
  maxCount: number;
  title: string;
}) {
  const opacity = count === 0 ? 0.06 : Math.min(0.2 + count / maxCount, 1);
  return (
    <div
      className="h-5 w-5 rounded-[3px] border border-border/40"
      style={{ backgroundColor: `hsl(221 83% 53% / ${opacity})` }}
      title={title}
    />
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function LeadRegistrationSummaryTable({
  labelColumn,
  rows,
  emptyMessage,
}: {
  labelColumn: string;
  rows: LeadRegistrationSummary[];
  emptyMessage: string;
}) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.leadsCreated += row.leadsCreated;
      acc.registeredUnpaid += row.registeredUnpaid;
      acc.regFeePaid += row.regFeePaid;
      return acc;
    },
    { leadsCreated: 0, registeredUnpaid: 0, regFeePaid: 0 },
  );

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labelColumn}</TableHead>
          <TableHead className="text-right">Leads Created</TableHead>
          <TableHead className="text-right">Registered (Unpaid)</TableHead>
          <TableHead className="text-right">Reg Fee Paid</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.groupId}>
            <TableCell className="font-medium">{row.groupName}</TableCell>
            <TableCell className="text-right">{row.leadsCreated}</TableCell>
            <TableCell className="text-right">{row.registeredUnpaid}</TableCell>
            <TableCell className="text-right">{row.regFeePaid}</TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-muted/30 font-semibold">
          <TableCell>Grand Total</TableCell>
          <TableCell className="text-right">{totals.leadsCreated}</TableCell>
          <TableCell className="text-right">{totals.registeredUnpaid}</TableCell>
          <TableCell className="text-right">{totals.regFeePaid}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function UserAuditReportsClient() {
  const now = React.useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = React.useState(getSgtDateKey(subDays(now, 29)));
  const [toDate, setToDate] = React.useState(getSgtDateKey(now));
  const [month, setMonth] = React.useState(getSgtMonthKey(now));
  const [collegeId, setCollegeId] = React.useState("all");
  const [course, setCourse] = React.useState("all");
  const [source, setSource] = React.useState<LeadSource | "all">("all");
  const [leadCreatedBy, setLeadCreatedBy] = React.useState<
    "all" | "system" | "users"
  >("all");
  const [counsellorId, setCounsellorId] = React.useState("all");
  const [appliedFilters, setAppliedFilters] = React.useState(() => ({
    fromDate: getSgtDateKey(subDays(now, 29)),
    toDate: getSgtDateKey(now),
    month: getSgtMonthKey(now),
    collegeId: "all",
    course: "all",
    source: "all" as LeadSource | "all",
    leadCreatedBy: "all" as "all" | "system" | "users",
    counsellorId: "all",
  }));

  const report = useUserAuditReport({
    fromDate: appliedFilters.fromDate,
    toDate: appliedFilters.toDate,
    month: appliedFilters.month,
    collegeId:
      appliedFilters.collegeId === "all"
        ? undefined
        : appliedFilters.collegeId,
    course: appliedFilters.course === "all" ? undefined : appliedFilters.course,
    source: appliedFilters.source === "all" ? undefined : appliedFilters.source,
    leadCreatedBy:
      appliedFilters.leadCreatedBy === "all"
        ? undefined
        : appliedFilters.leadCreatedBy,
    counsellorId:
      appliedFilters.counsellorId === "all"
        ? undefined
        : appliedFilters.counsellorId,
  });

  const monthDate = React.useMemo(() => {
    const monthRange = getSgtMonthRangeUtc(appliedFilters.month);
    return new Date(
      monthRange?.startIso ?? `${appliedFilters.month}-01T00:00:00Z`,
    );
  }, [appliedFilters.month]);
  const heatmap = React.useMemo(
    () => buildHeatmap(report.data?.crmEntriesMonth ?? [], monthDate),
    [monthDate, report.data?.crmEntriesMonth],
  );

  const metricTotals = React.useMemo(() => {
    const events = report.data?.events ?? [];
    return {
      crmEntries: (report.data?.crmEntriesRange ?? []).length,
      leadsCreated: events.filter((e) => e.event_type === "lead_created").length,
      followUpsCompleted: events.filter((e) => e.event_type === "follow_up_completed").length,
      registrations: events.filter((e) => e.event_type === "registration").length,
      counsellingCompleted: events.filter((e) => e.event_type === "counselling_completed").length,
      counsellingStarted: events.filter((e) => e.event_type === "counselling_started").length,
    };
  }, [report.data?.crmEntriesRange, report.data?.events]);

  const userSummaries = React.useMemo(
    () => summarizeByUser(report.data?.events ?? [], report.data?.crmEntriesRange ?? []),
    [report.data?.crmEntriesRange, report.data?.events],
  );
  const counsellorLeadSummaries = React.useMemo(
    () =>
      summarizeLeadsByCounsellor(
        report.data?.leads ?? [],
        appliedFilters.fromDate,
        appliedFilters.toDate,
      ),
    [appliedFilters.fromDate, appliedFilters.toDate, report.data?.leads],
  );
  const courseLeadSummaries = React.useMemo(
    () =>
      summarizeLeadsByCourse(
        report.data?.leads ?? [],
        appliedFilters.fromDate,
        appliedFilters.toDate,
      ),
    [appliedFilters.fromDate, appliedFilters.toDate, report.data?.leads],
  );
  const sourceLeadSummaries = React.useMemo(
    () =>
      summarizeLeadsBySource(
        report.data?.leads ?? [],
        appliedFilters.fromDate,
        appliedFilters.toDate,
      ),
    [appliedFilters.fromDate, appliedFilters.toDate, report.data?.leads],
  );

  const collegeOptions = React.useMemo(
    () => report.data?.colleges ?? [],
    [report.data?.colleges],
  );
  const selectedCollege = collegeOptions.find((c) => c.id === collegeId);
  const courseOptions = React.useMemo(() => {
    if (selectedCollege) {
      return Array.from(new Set((selectedCollege.courses ?? []).map((c) => c.trim()).filter(Boolean)));
    }
    const set = new Set<string>();
    for (const college of collegeOptions) {
      for (const item of college.courses ?? []) {
        const normalized = item.trim();
        if (normalized) set.add(normalized);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [collegeOptions, selectedCollege]);

  const counsellorOptions = (report.data?.profiles ?? []).filter((p) =>
    ["counsellor", "admission_manager", "management", "super_admin"].includes(p.role),
  );
  const sourceOptions = React.useMemo(
    () => Object.keys(LEAD_SOURCE_LABELS) as LeadSource[],
    [],
  );

  const filterSummary = React.useMemo(() => {
    const counsellor =
      appliedFilters.counsellorId === "all"
        ? null
        : counsellorOptions.find(
            (profile) => profile.id === appliedFilters.counsellorId,
          );

    return joinFilterParts([
      `Period: ${appliedFilters.fromDate} to ${appliedFilters.toDate}`,
      `Heatmap month: ${appliedFilters.month}`,
      appliedFilters.collegeId !== "all"
        ? `College: ${
            collegeOptions.find((college) => college.id === appliedFilters.collegeId)
              ?.name ?? appliedFilters.collegeId
          }`
        : null,
      appliedFilters.course !== "all" ? `Course: ${appliedFilters.course}` : null,
      appliedFilters.source !== "all"
        ? `Source: ${LEAD_SOURCE_LABELS[appliedFilters.source]}`
        : null,
      appliedFilters.leadCreatedBy !== "all"
        ? `Lead created by: ${
            appliedFilters.leadCreatedBy === "system" ? "System" : "Users"
          }`
        : null,
      counsellor ? `Counsellor: ${counsellor.full_name || counsellor.email}` : null,
    ]);
  }, [
    appliedFilters,
    collegeOptions,
    counsellorOptions,
  ]);

  if (report.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <ReportPrintable
      title="User Audit Report"
      documentTitle={`User Audit Report ${appliedFilters.fromDate} to ${appliedFilters.toDate}`}
      filterSummary={filterSummary}
    >
      <div className="no-print space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">User Audit Report</h2>
        <p className="text-sm text-muted-foreground">
          CRM entry heatmap, user audit breakdown, and recent CRM entries.
        </p>
      </div>

      <Card className="no-print">
        <CardHeader>
          <CardTitle>User Audit Filters</CardTitle>
          <CardDescription>
            Filter reports by date, college, course, source, creator type, and
            counsellor.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Start date</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">End date</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Heatmap month</label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">College</label>
            <Select value={collegeId} onValueChange={setCollegeId}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All colleges</SelectItem>
                {collegeOptions.map((college) => (
                  <SelectItem key={college.id} value={college.id}>
                    {college.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Course</label>
            <Select value={course} onValueChange={setCourse}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courses</SelectItem>
                {courseOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Source</label>
            <Select value={source} onValueChange={(value) => setSource(value as LeadSource | "all")}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sourceOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {LEAD_SOURCE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Lead Created</label>
            <Select value={leadCreatedBy} onValueChange={(value) => setLeadCreatedBy(value as "all" | "system" | "users")}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="users">Users</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Counsellor</label>
            <Select value={counsellorId} onValueChange={setCounsellorId}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All counsellors</SelectItem>
                {counsellorOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={() =>
              setAppliedFilters({
                fromDate,
                toDate,
                month,
                collegeId,
                course,
                source,
                leadCreatedBy,
                counsellorId,
              })
            }
          >
            Apply filters
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFromDate(getSgtDateKey(subDays(now, 29)));
              setToDate(getSgtDateKey(now));
              setMonth(getSgtMonthKey(now));
              setCollegeId("all");
              setCourse("all");
              setSource("all");
              setLeadCreatedBy("all");
              setCounsellorId("all");
            }}
          >
            Reset selections
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="CRM Entries"
          value={metricTotals.crmEntries}
          icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Leads Created"
          value={metricTotals.leadsCreated}
          icon={<UsersRound className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Follow-ups Completed"
          value={metricTotals.followUpsCompleted}
          icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Registrations"
          value={metricTotals.registrations}
          icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Counselling Completed"
          value={metricTotals.counsellingCompleted}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Counselling Started"
          value={metricTotals.counsellingStarted}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CRM Entry Heatmap ({formatSgtMonthYear(monthDate)})</CardTitle>
          <CardDescription>
            Hour-by-hour CRM entries for the selected month. Date and counsellor filters apply; college/course do not apply to CRM entry logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-md border p-3">
            <div className="inline-block min-w-full">
              <div className="mb-2 flex items-center gap-1">
                <div className="w-12 text-[10px] text-muted-foreground">Hour</div>
                {heatmap.days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="w-5 text-center text-[10px] text-muted-foreground"
                    title={formatSgtDate(day)}
                  >
                    {Number(getSgtDateKey(day).split("-")[2] ?? "0")}
                  </div>
                ))}
              </div>
              {heatmap.hours.map((hour) => (
                <div key={hour} className="mb-1 flex items-center gap-1">
                  <div className="w-12 text-[10px] text-muted-foreground">
                    {String(hour).padStart(2, "0")}:00
                  </div>
                  {heatmap.days.map((day) => {
                    const dateKey = getSgtDateKey(day);
                    const key = `${dateKey}-${hour}`;
                    const count = heatmap.counts.get(key) ?? 0;
                    return (
                      <HeatCell
                        key={key}
                        count={count}
                        maxCount={heatmap.maxCount}
                        title={`${formatSgtDate(day)} ${String(hour).padStart(2, "0")}:00 · ${count} entries`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Intensity</span>
            <HeatCell count={0} maxCount={1} title="No entries" />
            <HeatCell count={Math.max(1, Math.floor(heatmap.maxCount / 2))} maxCount={heatmap.maxCount} title="Medium" />
            <HeatCell count={heatmap.maxCount} maxCount={heatmap.maxCount} title="High" />
            <Badge variant="secondary">{(report.data?.crmEntriesMonth ?? []).length} entries this month</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Counsellor Lead & Registration Summary</CardTitle>
          <CardDescription>
            Leads created use lead creation date. Registration counts use registration done date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadRegistrationSummaryTable
            labelColumn="Counsellor"
            rows={counsellorLeadSummaries}
            emptyMessage="No lead or registration data for selected filters."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Courses Lead & Registration Summary</CardTitle>
          <CardDescription>
            Grouped by interested course with current filters applied.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadRegistrationSummaryTable
            labelColumn="Course"
            rows={courseLeadSummaries}
            emptyMessage="No lead or registration data for selected filters."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sources Lead & Registration Summary</CardTitle>
          <CardDescription>
            Grouped by lead source with current filters applied.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadRegistrationSummaryTable
            labelColumn="Source"
            rows={sourceLeadSummaries}
            emptyMessage="No lead or registration data for selected filters."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Audit Breakdown</CardTitle>
          <CardDescription>Action counts per user for the selected filters.</CardDescription>
        </CardHeader>
        <CardContent>
          {userSummaries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No audit data for selected filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">CRM Entries</TableHead>
                  <TableHead className="text-right">Leads Created</TableHead>
                  <TableHead className="text-right">Follow-ups Completed</TableHead>
                  <TableHead className="text-right">Registrations</TableHead>
                  <TableHead className="text-right">Counselling Completed</TableHead>
                  <TableHead className="text-right">Counselling Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userSummaries.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.crmEntries}</TableCell>
                    <TableCell className="text-right">{row.leadsCreated}</TableCell>
                    <TableCell className="text-right">{row.followUpsCompleted}</TableCell>
                    <TableCell className="text-right">{row.registrations}</TableCell>
                    <TableCell className="text-right">{row.counsellingCompleted}</TableCell>
                    <TableCell className="text-right">{row.counsellingStarted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent CRM Entries</CardTitle>
          <CardDescription>Latest entry timestamps used for the heatmap and audit trail.</CardDescription>
        </CardHeader>
        <CardContent>
          {(report.data?.crmEntriesRange ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No CRM entries in selected date range.</div>
          ) : (
            <ul className="space-y-2">
              {(report.data?.crmEntriesRange ?? []).slice(0, 20).map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span>{toUserName(entry.user)}</span>
                  <span className="text-muted-foreground">{formatSgtDateTime(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </ReportPrintable>
  );
}
