"use client";

import * as React from "react";
import Link from "next/link";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  subDays,
} from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  Clock3,
  GraduationCap,
  Megaphone,
  TrendingUp,
  UserCheck,
  UsersRound,
  Zap,
} from "lucide-react";

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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  isRegistrationPaid,
  isRegistrationUnpaid,
  type RegistrationReportLeadRow,
  useRegistrationReport,
} from "@/lib/hooks/use-registration-report";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, type LeadSource } from "@/lib/types";

type GroupSummary = {
  groupId: string;
  groupName: string;
  unpaid: number;
  paid: number;
  total: number;
  avgDays: number | null;
  medianDays: number | null;
};

type DayBucket = {
  label: string;
  count: number;
};

type CountBreakdown = {
  total: number;
  unpaid: number;
  paid: number;
};

type CourseBySourceMatrix = {
  courses: { id: string; name: string }[];
  sources: { id: LeadSource; name: string }[];
  cells: Map<string, CountBreakdown>;
  rowTotals: Map<string, CountBreakdown>;
  colTotals: Map<string, CountBreakdown>;
  grandTotal: CountBreakdown;
};

const TREND_CONFIG: ChartConfig = {
  unpaid: { label: "Unpaid", color: "hsl(var(--chart-2))" },
  paid: { label: "Paid", color: "hsl(var(--chart-1))" },
};

const BUCKET_CONFIG: ChartConfig = {
  count: { label: "Registrations", color: "hsl(var(--chart-3))" },
};

const DAY_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: "0–7 days", min: 0, max: 7 },
  { label: "8–14 days", min: 8, max: 14 },
  { label: "15–30 days", min: 15, max: 30 },
  { label: "31+ days", min: 31, max: null },
];

function toUserName(user: { full_name: string | null; email: string } | null | undefined) {
  if (!user) return "Unassigned";
  return user.full_name || user.email;
}

function daysToRegister(lead: RegistrationReportLeadRow) {
  return Math.max(
    differenceInCalendarDays(
      new Date(lead.registration_completed_at),
      new Date(lead.created_at),
    ),
    0,
  );
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(part: number, whole: number) {
  if (whole === 0) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function summarizeByGroup(
  leads: RegistrationReportLeadRow[],
  getGroup: (lead: RegistrationReportLeadRow) => { id: string; name: string },
): GroupSummary[] {
  const map = new Map<string, GroupSummary & { dayValues: number[] }>();

  for (const lead of leads) {
    const group = getGroup(lead);
    if (!map.has(group.id)) {
      map.set(group.id, {
        groupId: group.id,
        groupName: group.name,
        unpaid: 0,
        paid: 0,
        total: 0,
        avgDays: null,
        medianDays: null,
        dayValues: [],
      });
    }
    const row = map.get(group.id)!;
    row.total += 1;
    if (isRegistrationUnpaid(lead.status)) row.unpaid += 1;
    if (isRegistrationPaid(lead.status)) row.paid += 1;
    row.dayValues.push(daysToRegister(lead));
  }

  return Array.from(map.values())
    .map(({ dayValues, ...row }) => ({
      ...row,
      avgDays: average(dayValues),
      medianDays: median(dayValues),
    }))
    .sort((a, b) => b.total - a.total);
}

function buildTrendData(leads: RegistrationReportLeadRow[], fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const days = eachDayOfInterval({ start: from, end: to });
  const byDay = new Map<string, { date: string; unpaid: number; paid: number }>();

  for (const day of days) {
    const key = format(day, "yyyy-MM-dd");
    byDay.set(key, { date: format(day, "MMM d"), unpaid: 0, paid: 0 });
  }

  for (const lead of leads) {
    const key = format(new Date(lead.registration_completed_at), "yyyy-MM-dd");
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (isRegistrationUnpaid(lead.status)) bucket.unpaid += 1;
    if (isRegistrationPaid(lead.status)) bucket.paid += 1;
  }

  return Array.from(byDay.values());
}

function emptyBreakdown(): CountBreakdown {
  return { total: 0, unpaid: 0, paid: 0 };
}

function addToBreakdown(target: CountBreakdown, lead: RegistrationReportLeadRow) {
  target.total += 1;
  if (isRegistrationUnpaid(lead.status)) target.unpaid += 1;
  if (isRegistrationPaid(lead.status)) target.paid += 1;
}

function cellKey(courseId: string, sourceId: LeadSource) {
  return `${courseId}::${sourceId}`;
}

function buildCourseBySourceMatrix(leads: RegistrationReportLeadRow[]): CourseBySourceMatrix {
  const courseMap = new Map<string, { id: string; name: string; total: number }>();
  const sourceMap = new Map<LeadSource, { id: LeadSource; name: string; total: number }>();
  const cells = new Map<string, CountBreakdown>();
  const rowTotals = new Map<string, CountBreakdown>();
  const colTotals = new Map<string, CountBreakdown>();
  const grandTotal = emptyBreakdown();

  for (const lead of leads) {
    const courseTrimmed = (lead.interested_course ?? "").trim();
    const courseId = courseTrimmed || "unspecified";
    const courseName = courseTrimmed || "Unspecified";

    if (!courseMap.has(courseId)) {
      courseMap.set(courseId, { id: courseId, name: courseName, total: 0 });
    }
    courseMap.get(courseId)!.total += 1;

    if (!sourceMap.has(lead.source)) {
      sourceMap.set(lead.source, {
        id: lead.source,
        name: LEAD_SOURCE_LABELS[lead.source] ?? lead.source,
        total: 0,
      });
    }
    sourceMap.get(lead.source)!.total += 1;

    const key = cellKey(courseId, lead.source);
    if (!cells.has(key)) cells.set(key, emptyBreakdown());
    if (!rowTotals.has(courseId)) rowTotals.set(courseId, emptyBreakdown());
    if (!colTotals.has(lead.source)) colTotals.set(lead.source, emptyBreakdown());

    addToBreakdown(cells.get(key)!, lead);
    addToBreakdown(rowTotals.get(courseId)!, lead);
    addToBreakdown(colTotals.get(lead.source)!, lead);
    addToBreakdown(grandTotal, lead);
  }

  const courses = Array.from(courseMap.values())
    .sort((a, b) => b.total - a.total)
    .map(({ id, name }) => ({ id, name }));
  const sources = Array.from(sourceMap.values())
    .sort((a, b) => b.total - a.total)
    .map(({ id, name }) => ({ id, name }));

  return { courses, sources, cells, rowTotals, colTotals, grandTotal };
}

function formatCellBreakdown(value: CountBreakdown) {
  if (value.total === 0) return "—";
  return `${value.total} (${value.unpaid}U/${value.paid}P)`;
}

function buildDayBuckets(leads: RegistrationReportLeadRow[]): DayBucket[] {
  const counts = DAY_BUCKETS.map((bucket) => ({ label: bucket.label, count: 0 }));

  for (const lead of leads) {
    const days = daysToRegister(lead);
    const index = DAY_BUCKETS.findIndex((bucket) => {
      if (bucket.max === null) return days >= bucket.min;
      return days >= bucket.min && days <= bucket.max;
    });
    if (index >= 0) counts[index].count += 1;
  }

  return counts;
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
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
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function GroupSummaryTable({
  labelColumn,
  rows,
  emptyMessage,
}: {
  labelColumn: string;
  rows: GroupSummary[];
  emptyMessage: string;
}) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.unpaid += row.unpaid;
      acc.paid += row.paid;
      acc.total += row.total;
      return acc;
    },
    { unpaid: 0, paid: 0, total: 0 },
  );

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labelColumn}</TableHead>
          <TableHead className="text-right">Unpaid</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Paid %</TableHead>
          <TableHead className="text-right">Avg days</TableHead>
          <TableHead className="text-right">Median days</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.groupId}>
            <TableCell className="font-medium">{row.groupName}</TableCell>
            <TableCell className="text-right">{row.unpaid}</TableCell>
            <TableCell className="text-right">{row.paid}</TableCell>
            <TableCell className="text-right">{row.total}</TableCell>
            <TableCell className="text-right">{percent(row.paid, row.total)}</TableCell>
            <TableCell className="text-right">
              {row.avgDays === null ? "—" : row.avgDays.toFixed(1)}
            </TableCell>
            <TableCell className="text-right">
              {row.medianDays === null ? "—" : row.medianDays.toFixed(0)}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-muted/30 font-semibold">
          <TableCell>Grand Total</TableCell>
          <TableCell className="text-right">{totals.unpaid}</TableCell>
          <TableCell className="text-right">{totals.paid}</TableCell>
          <TableCell className="text-right">{totals.total}</TableCell>
          <TableCell className="text-right">{percent(totals.paid, totals.total)}</TableCell>
          <TableCell className="text-right">—</TableCell>
          <TableCell className="text-right">—</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function CourseBySourceTable({
  matrix,
  emptyMessage,
}: {
  matrix: CourseBySourceMatrix;
  emptyMessage: string;
}) {
  if (matrix.courses.length === 0 || matrix.sources.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 min-w-[160px] bg-background">
              Course
            </TableHead>
            {matrix.sources.map((source) => (
              <TableHead key={source.id} className="min-w-[100px] text-right">
                {source.name}
              </TableHead>
            ))}
            <TableHead className="min-w-[88px] text-right font-semibold">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matrix.courses.map((course) => {
            const rowTotal = matrix.rowTotals.get(course.id) ?? emptyBreakdown();
            return (
              <TableRow key={course.id}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium">
                  {course.name}
                </TableCell>
                {matrix.sources.map((source) => {
                  const value =
                    matrix.cells.get(cellKey(course.id, source.id)) ?? emptyBreakdown();
                  return (
                    <TableCell
                      key={source.id}
                      className="text-right tabular-nums"
                      title={
                        value.total > 0
                          ? `${value.total} total · ${value.unpaid} unpaid · ${value.paid} paid`
                          : undefined
                      }
                    >
                      {formatCellBreakdown(value)}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCellBreakdown(rowTotal)}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-muted/30 font-semibold">
            <TableCell className="sticky left-0 z-10 bg-muted/30">Grand Total</TableCell>
            {matrix.sources.map((source) => {
              const colTotal = matrix.colTotals.get(source.id) ?? emptyBreakdown();
              return (
                <TableCell key={source.id} className="text-right tabular-nums">
                  {formatCellBreakdown(colTotal)}
                </TableCell>
              );
            })}
            <TableCell className="text-right tabular-nums">
              {formatCellBreakdown(matrix.grandTotal)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export function RegistrationReportsClient() {
  const now = React.useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = React.useState(format(subDays(now, 29), "yyyy-MM-dd"));
  const [toDate, setToDate] = React.useState(format(now, "yyyy-MM-dd"));
  const [collegeId, setCollegeId] = React.useState("all");
  const [course, setCourse] = React.useState("all");
  const [source, setSource] = React.useState<LeadSource | "all">("all");
  const [counsellorId, setCounsellorId] = React.useState("all");
  const [paymentStatus, setPaymentStatus] = React.useState<"all" | "unpaid" | "paid">("all");

  const report = useRegistrationReport({
    fromDate,
    toDate,
    collegeId: collegeId === "all" ? undefined : collegeId,
    course: course === "all" ? undefined : course,
    source: source === "all" ? undefined : source,
    counsellorId: counsellorId === "all" ? undefined : counsellorId,
    paymentStatus,
  });

  const leads = report.data?.leads ?? [];
  const collegeOptions = report.data?.colleges ?? [];
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

  const collegeNameById = React.useMemo(
    () => new Map(collegeOptions.map((college) => [college.id, college.name])),
    [collegeOptions],
  );

  const dayValues = React.useMemo(() => leads.map(daysToRegister), [leads]);
  const sameDayStats = React.useMemo(() => {
    const count = leads.filter((lead) => daysToRegister(lead) === 0).length;
    return { count, rate: percent(count, leads.length) };
  }, [leads]);
  const totals = React.useMemo(() => {
    const unpaid = leads.filter((lead) => isRegistrationUnpaid(lead.status)).length;
    const paid = leads.filter((lead) => isRegistrationPaid(lead.status)).length;
    return { total: leads.length, unpaid, paid };
  }, [leads]);

  const sourceSummaries = React.useMemo(
    () =>
      summarizeByGroup(leads, (lead) => ({
        id: lead.source,
        name: LEAD_SOURCE_LABELS[lead.source] ?? lead.source,
      })),
    [leads],
  );

  const courseSummaries = React.useMemo(
    () =>
      summarizeByGroup(leads, (lead) => {
        const trimmed = (lead.interested_course ?? "").trim();
        return { id: trimmed || "unspecified", name: trimmed || "Unspecified" };
      }),
    [leads],
  );

  const collegeSummaries = React.useMemo(
    () =>
      summarizeByGroup(leads, (lead) => ({
        id: lead.college_id ?? "unassigned",
        name: lead.college_id
          ? (collegeNameById.get(lead.college_id) ?? "Unknown college")
          : "Unassigned",
      })),
    [collegeNameById, leads],
  );

  const counsellorSummaries = React.useMemo(
    () =>
      summarizeByGroup(leads, (lead) => ({
        id: lead.assigned_counsellor ?? "unassigned",
        name: toUserName(lead.counsellor),
      })),
    [leads],
  );

  const trendData = React.useMemo(
    () => buildTrendData(leads, fromDate, toDate),
    [fromDate, leads, toDate],
  );

  const dayBuckets = React.useMemo(() => buildDayBuckets(leads), [leads]);

  const courseBySourceMatrix = React.useMemo(
    () => buildCourseBySourceMatrix(leads),
    [leads],
  );

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
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Registration Report</h2>
        <p className="text-sm text-muted-foreground">
          Registrations filtered by registration date only. Includes unpaid/paid breakdown,
          time-to-register metrics, and decision-making summaries.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registration Filters</CardTitle>
          <CardDescription>
            Date range applies to registration completed date. All counts below are scoped to
            registrations in this period.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Registration from</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Registration to</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Payment status</label>
            <Select
              value={paymentStatus}
              onValueChange={(value) => setPaymentStatus(value as "all" | "unpaid" | "paid")}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All registrations</SelectItem>
                <SelectItem value="unpaid">Unpaid only</SelectItem>
                <SelectItem value="paid">Paid only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFromDate(format(subDays(now, 29), "yyyy-MM-dd"));
              setToDate(format(now, "yyyy-MM-dd"));
              setCollegeId("all");
              setCourse("all");
              setSource("all");
              setCounsellorId("all");
              setPaymentStatus("all");
            }}
          >
            Reset filters
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total Registrations"
          value={totals.total}
          icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Unpaid"
          value={totals.unpaid}
          hint={percent(totals.unpaid, totals.total)}
          icon={<UsersRound className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Paid"
          value={totals.paid}
          hint={percent(totals.paid, totals.total)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Avg days to register"
          value={average(dayValues) === null ? "—" : average(dayValues)!.toFixed(1)}
          hint="Lead created → registered"
          icon={<Clock3 className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          label="Same-day registrations"
          value={totals.total === 0 ? "—" : sameDayStats.rate}
          hint={
            totals.total === 0
              ? "Registered on inquiry day"
              : `${sameDayStats.count} of ${totals.total} on inquiry day`
          }
          icon={<Zap className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registrations Over Time</CardTitle>
            <CardDescription>Daily unpaid vs paid registrations in the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 || totals.total === 0 ? (
              <EmptyChart label="No registrations in selected period" />
            ) : (
              <ChartContainer config={TREND_CONFIG} className="h-[280px] w-full">
                <BarChart data={trendData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="unpaid" stackId="registrations" fill="var(--color-unpaid)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="paid" stackId="registrations" fill="var(--color-paid)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time to Register</CardTitle>
            <CardDescription>
              Days from lead created to registration completed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dayBuckets.every((bucket) => bucket.count === 0) ? (
              <EmptyChart label="No registration timing data" />
            ) : (
              <ChartContainer config={BUCKET_CONFIG} className="h-[280px] w-full">
                <BarChart data={dayBuckets} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Registrations by Source
          </CardTitle>
          <CardDescription>Unpaid/paid split and time-to-register by lead source.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupSummaryTable
            labelColumn="Source"
            rows={sourceSummaries}
            emptyMessage="No registrations for selected filters."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Registrations by Course
          </CardTitle>
          <CardDescription>Grouped by interested course at registration.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupSummaryTable
            labelColumn="Course"
            rows={courseSummaries}
            emptyMessage="No registrations for selected filters."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Course by Source
          </CardTitle>
          <CardDescription>
            Cross-tab of registrations by course and source. Each cell shows total
            with unpaid/paid breakdown (e.g. 3 (3U/0P)). Hover for details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseBySourceTable
            matrix={courseBySourceMatrix}
            emptyMessage="No registrations for selected filters."
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registrations by College</CardTitle>
            <CardDescription>Volume and payment mix by college.</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupSummaryTable
              labelColumn="College"
              rows={collegeSummaries}
              emptyMessage="No registrations for selected filters."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registrations by Counsellor</CardTitle>
            <CardDescription>Assigned counsellor performance for the period.</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupSummaryTable
              labelColumn="Counsellor"
              rows={counsellorSummaries}
              emptyMessage="No registrations for selected filters."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registration Detail</CardTitle>
          <CardDescription>
            Individual leads registered in the selected period with days from inquiry to registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No registrations for selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Counsellor</TableHead>
                  <TableHead className="text-right">Days to register</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="hover:underline"
                      >
                        {lead.full_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {format(new Date(lead.registration_completed_at), "PP")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</TableCell>
                    <TableCell>{lead.interested_course?.trim() || "—"}</TableCell>
                    <TableCell>{toUserName(lead.counsellor)}</TableCell>
                    <TableCell className="text-right">{daysToRegister(lead)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
