"use client";

import * as React from "react";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfWeek,
  format,
  startOfWeek,
  subDays,
} from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, GraduationCap, TrendingUp, UsersRound } from "lucide-react";

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
  ChartLegend,
  ChartLegendContent,
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
  joinFilterParts,
  ReportPrintable,
} from "@/components/reports/report-printable";
import { useColleges } from "@/lib/hooks/use-colleges";
import { useLeads } from "@/lib/hooks/use-leads";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from "@/lib/types";

type FunnelStage = {
  key: string;
  label: string;
  matches: (lead: Lead) => boolean;
};

const COUNSELLING_STARTED_STATUSES = new Set<LeadStatus>([
  "counselling_in_progress",
  "counselling_completed",
  "registration_unpaid",
  "registered_paid_reg_fee",
  "on_discussions",
  "registered_closed",
  "registered_dropped_out",
]);

const COUNSELLING_COMPLETED_STATUSES = new Set<LeadStatus>([
  "counselling_completed",
  "registration_unpaid",
  "registered_paid_reg_fee",
  "registered_closed",
  "registered_dropped_out",
]);

const REGISTRATION_STATUSES = new Set<LeadStatus>([
  "registration_unpaid",
  "registered_paid_reg_fee",
  "registered_closed",
  "registered_dropped_out",
]);

const SOURCE_PERFORMANCE_CONFIG: ChartConfig = {
  created: { label: "Leads created", color: "hsl(var(--chart-1))" },
  registered: { label: "Registrations", color: "hsl(var(--chart-2))" },
};

function isLeadRegistered(lead: Lead) {
  return REGISTRATION_STATUSES.has(lead.status) || !!lead.registration_completed_at;
}

function truncateChartLabel(label: string, max = 16) {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}

function sourcePerformanceConversionLabel(
  label: string,
  payload: unknown[],
) {
  const row = (payload[0] as { payload?: { created?: number; registered?: number; source?: string } })
    ?.payload;
  if (!row?.created) return label;
  const rate = ((row.registered ?? 0) / row.created) * 100;
  return (
    <div className="space-y-1">
      <div className="font-medium">{row.source ?? label}</div>
      <div className="text-muted-foreground">
        Conversion: {rate.toFixed(1)}% registered
      </div>
    </div>
  );
}

/** Cumulative pipeline stages: each stage counts leads that reached at least that point. */
const FUNNEL_STAGES: FunnelStage[] = [
  {
    key: "inquiries",
    label: "Inquiries Received",
    matches: () => true,
  },
  {
    key: "counselling_started",
    label: "Counselling Started",
    matches: (lead) =>
      COUNSELLING_STARTED_STATUSES.has(lead.status) || !!lead.counselling_completed_at,
  },
  {
    key: "counselling_completed",
    label: "Counselling Completed",
    matches: (lead) =>
      COUNSELLING_COMPLETED_STATUSES.has(lead.status) || !!lead.counselling_completed_at,
  },
  {
    key: "registrations",
    label: "Registrations",
    matches: (lead) =>
      REGISTRATION_STATUSES.has(lead.status) || !!lead.registration_completed_at,
  },
];

const FUNNEL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function percent(part: number, whole: number) {
  if (whole === 0) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function chartCountLabel(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return "";
  return String(count);
}

type TrendGranularity = "daily" | "weekly" | "monthly";

function defaultTrendGranularity(fromDate: string, toDate: string): TrendGranularity {
  const days = differenceInCalendarDays(new Date(toDate), new Date(fromDate));
  if (days > 90) return "monthly";
  if (days > 31) return "weekly";
  return "daily";
}

function buildTrendData(
  leads: Lead[],
  fromDate: string,
  toDate: string,
  granularity: TrendGranularity,
) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const counts = new Map<string, number>();

  if (granularity === "daily") {
    for (const lead of leads) {
      const key = format(new Date(lead.created_at), "yyyy-MM-dd");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return eachDayOfInterval({ start: from, end: to }).map((bucket) => {
      const key = format(bucket, "yyyy-MM-dd");
      return {
        label: format(bucket, "d MMM"),
        count: counts.get(key) ?? 0,
      };
    });
  }

  if (granularity === "weekly") {
    for (const lead of leads) {
      const weekStart = startOfWeek(new Date(lead.created_at), { weekStartsOn: 1 });
      const key = format(weekStart, "yyyy-MM-dd");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 }).map((bucket) => {
      const weekEnd = endOfWeek(bucket, { weekStartsOn: 1 });
      const key = format(bucket, "yyyy-MM-dd");
      return {
        label: `${format(bucket, "d MMM")} – ${format(weekEnd, "d MMM")}`,
        count: counts.get(key) ?? 0,
      };
    });
  }

  for (const lead of leads) {
    const key = format(new Date(lead.created_at), "yyyy-MM");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return eachMonthOfInterval({ start: from, end: to }).map((bucket) => {
    const key = format(bucket, "yyyy-MM");
    return {
      label: format(bucket, "MMM yyyy"),
      count: counts.get(key) ?? 0,
    };
  });
}

function KpiCard({
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

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function LeadFunnelReportsClient({
  isAdmin = false,
  currentUserId,
}: {
  isAdmin?: boolean;
  currentUserId: string;
}) {
  const now = React.useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = React.useState(format(subDays(now, 29), "yyyy-MM-dd"));
  const [toDate, setToDate] = React.useState(format(now, "yyyy-MM-dd"));
  const [collegeId, setCollegeId] = React.useState("all");
  const [source, setSource] = React.useState<LeadSource | "all">("all");
  // Default to the logged-in user's own pipeline. Admins can switch via the
  // Counsellor filter; non-admins stay scoped to themselves.
  const [counsellorId, setCounsellorId] = React.useState(currentUserId);
  const [appliedFilters, setAppliedFilters] = React.useState(() => ({
    fromDate: format(subDays(now, 29), "yyyy-MM-dd"),
    toDate: format(now, "yyyy-MM-dd"),
    collegeId: "all",
    source: "all" as LeadSource | "all",
    counsellorId: currentUserId,
  }));

  const leadsQuery = useLeads({
    collegeId: appliedFilters.collegeId,
    source: appliedFilters.source,
    counsellorId: isAdmin ? appliedFilters.counsellorId : currentUserId,
  });
  const collegesQuery = useColleges();
  const profilesQuery = useProfiles();

  const leads = React.useMemo(() => {
    const all = leadsQuery.data ?? [];
    const from = appliedFilters.fromDate
      ? new Date(`${appliedFilters.fromDate}T00:00:00`)
      : null;
    const to = appliedFilters.toDate
      ? new Date(`${appliedFilters.toDate}T23:59:59.999`)
      : null;
    return all.filter((lead) => {
      const createdAt = new Date(lead.created_at);
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      return true;
    });
  }, [appliedFilters.fromDate, appliedFilters.toDate, leadsQuery.data]);

  const funnelRows = React.useMemo(
    () =>
      FUNNEL_STAGES.map((stage, index) => ({
        key: stage.key,
        name: stage.label,
        count: leads.filter(stage.matches).length,
        fill: FUNNEL_COLORS[index % FUNNEL_COLORS.length],
      })),
    [leads],
  );

  const statusData = React.useMemo(
    () =>
      (Object.keys(LEAD_STATUS_LABELS) as LeadStatus[])
        .map((status) => ({
          status: LEAD_STATUS_LABELS[status],
          count: leads.filter((l) => l.status === status).length,
        }))
        .filter((row) => row.count > 0),
    [leads],
  );

  const sourcePerformanceData = React.useMemo(
    () =>
      (Object.keys(LEAD_SOURCE_LABELS) as LeadSource[])
        .map((src) => {
          const sourceLeads = leads.filter((l) => l.source === src);
          const created = sourceLeads.length;
          const registered = sourceLeads.filter(isLeadRegistered).length;
          return {
            key: src,
            source: LEAD_SOURCE_LABELS[src],
            created,
            registered,
          };
        })
        .filter((row) => row.created > 0)
        .sort((a, b) => b.created - a.created),
    [leads],
  );

  const defaultGranularity = React.useMemo(
    () =>
      defaultTrendGranularity(
        appliedFilters.fromDate,
        appliedFilters.toDate,
      ),
    [appliedFilters.fromDate, appliedFilters.toDate],
  );
  const [trendGranularity, setTrendGranularity] = React.useState<TrendGranularity>("daily");

  React.useEffect(() => {
    setTrendGranularity(defaultGranularity);
  }, [defaultGranularity]);

  const trendData = React.useMemo(
    () =>
      buildTrendData(
        leads,
        appliedFilters.fromDate,
        appliedFilters.toDate,
        trendGranularity,
      ),
    [appliedFilters.fromDate, appliedFilters.toDate, leads, trendGranularity],
  );

  const showTrendLabels = trendData.length <= 31;

  const totalLeads = funnelRows[0]?.count ?? 0;
  const counsellingCompleted =
    funnelRows.find((r) => r.key === "counselling_completed")?.count ?? 0;
  const registrations =
    funnelRows.find((r) => r.key === "registrations")?.count ?? 0;

  const counsellorOptions = (profilesQuery.data ?? []).filter(
    (p) =>
      p.is_active &&
      ["counsellor", "admission_manager", "management", "super_admin"].includes(p.role),
  );

  const filterSummary = React.useMemo(() => {
    const collegeName =
      appliedFilters.collegeId === "all"
        ? null
        : (collegesQuery.data?.find((c) => c.id === appliedFilters.collegeId)?.name ??
          appliedFilters.collegeId);
    const sourceLabel =
      appliedFilters.source === "all"
        ? null
        : LEAD_SOURCE_LABELS[appliedFilters.source];
    const counsellor =
      isAdmin && appliedFilters.counsellorId !== "all"
        ? counsellorOptions.find((p) => p.id === appliedFilters.counsellorId)
        : !isAdmin
          ? counsellorOptions.find((p) => p.id === currentUserId)
          : null;

    return joinFilterParts([
      `Period: ${appliedFilters.fromDate} to ${appliedFilters.toDate}`,
      collegeName ? `College: ${collegeName}` : null,
      sourceLabel ? `Source: ${sourceLabel}` : null,
      counsellor ? `Counsellor: ${counsellor.full_name || counsellor.email}` : null,
    ]);
  }, [
    appliedFilters,
    collegesQuery.data,
    counsellorOptions,
    currentUserId,
    isAdmin,
  ]);

  if (leadsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <ReportPrintable
      title="Lead Funnel Report"
      documentTitle={`Lead Funnel Report ${appliedFilters.fromDate} to ${appliedFilters.toDate}`}
      filterSummary={filterSummary}
    >
      <Card className="no-print">
        <CardHeader>
          <CardTitle>Lead Report Filters</CardTitle>
          <CardDescription>
            Filter the funnel and charts by lead creation date, college, source
            {isAdmin ? ", and counsellor" : ""}.
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
            <label className="text-xs text-muted-foreground">College</label>
            <Select value={collegeId} onValueChange={setCollegeId}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All colleges</SelectItem>
                {(collegesQuery.data ?? []).map((college) => (
                  <SelectItem key={college.id} value={college.id}>
                    {college.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Source</label>
            <Select value={source} onValueChange={(v) => setSource(v as LeadSource | "all")}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((src) => (
                  <SelectItem key={src} value={src}>
                    {LEAD_SOURCE_LABELS[src]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin ? (
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
          ) : null}
          <Button
            type="button"
            onClick={() =>
              setAppliedFilters({
                fromDate,
                toDate,
                collegeId,
                source,
                counsellorId: isAdmin ? counsellorId : currentUserId,
              })
            }
          >
            Apply filters
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFromDate(format(subDays(now, 29), "yyyy-MM-dd"));
              setToDate(format(now, "yyyy-MM-dd"));
              setCollegeId("all");
              setSource("all");
              setCounsellorId(currentUserId);
            }}
          >
            Reset filters
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Leads"
          value={totalLeads}
          hint="In selected period"
          icon={<UsersRound className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Counselling Completed"
          value={counsellingCompleted}
          hint={`${percent(counsellingCompleted, totalLeads)} of leads`}
          icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Registrations"
          value={registrations}
          hint={`${percent(registrations, totalLeads)} of leads`}
          icon={<GraduationCap className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Conversion Rate"
          value={percent(registrations, totalLeads)}
          hint="Inquiry → registration"
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead Funnel</CardTitle>
            <CardDescription>
              Leads reaching each pipeline stage in the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalLeads === 0 ? (
              <EmptyChart label="No leads in selected period" />
            ) : (
              <ChartContainer
                config={{ count: { label: "Leads", color: "hsl(var(--chart-1))" } }}
                className="h-[280px] w-full"
              >
                <FunnelChart margin={{ left: 8, right: 8 }}>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Funnel dataKey="count" data={funnelRows} isAnimationActive>
                    <LabelList
                      position="center"
                      dataKey="count"
                      stroke="none"
                      fill="hsl(var(--primary-foreground))"
                      fontSize={12}
                      formatter={chartCountLabel}
                    />
                    <LabelList
                      position="right"
                      dataKey="name"
                      stroke="none"
                      fill="hsl(var(--foreground))"
                      fontSize={12}
                    />
                  </Funnel>
                </FunnelChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stage Conversion</CardTitle>
            <CardDescription>Counts, share of total, and stage-to-stage conversion.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                  <TableHead className="text-right">From Previous</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funnelRows.map((row, index) => {
                  const prev = index === 0 ? row.count : funnelRows[index - 1].count;
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-[2px]"
                            style={{ backgroundColor: row.fill }}
                          />
                          {row.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{percent(row.count, totalLeads)}</TableCell>
                      <TableCell className="text-right">
                        {index === 0 ? "—" : percent(row.count, prev)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leads by Status</CardTitle>
          <CardDescription>Current status of leads created in the period.</CardDescription>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <EmptyChart label="No leads in selected period" />
          ) : (
            <ChartContainer
              config={{ count: { label: "Leads", color: "hsl(var(--chart-1))" } }}
              className="h-[280px] w-full"
            >
              <BarChart data={statusData} margin={{ left: 8, right: 8, top: 20 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="status"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  interval={0}
                  angle={-12}
                  height={50}
                />
                <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={4} fill="hsl(var(--chart-1))">
                  <LabelList
                    dataKey="count"
                    position="top"
                    formatter={chartCountLabel}
                    className="fill-foreground"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads by Source</CardTitle>
          <CardDescription>
            Leads created vs registrations by source. Hover a source to compare conversion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sourcePerformanceData.length === 0 ? (
            <EmptyChart label="No leads in selected period" />
          ) : (
            <ChartContainer config={SOURCE_PERFORMANCE_CONFIG} className="h-[380px] w-full">
              <ComposedChart
                data={sourcePerformanceData}
                margin={{ top: 24, right: 12, left: 8, bottom: 64 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="source"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={10}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={72}
                  tickFormatter={(value) => truncateChartLabel(String(value))}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} fontSize={11} />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={sourcePerformanceConversionLabel}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="created"
                  fill="var(--color-created)"
                  fillOpacity={0.2}
                  stroke="var(--color-created)"
                  strokeWidth={2}
                  isAnimationActive
                >
                  <LabelList
                    dataKey="created"
                    position="top"
                    formatter={chartCountLabel}
                    className="fill-foreground"
                    fontSize={10}
                  />
                </Area>
                <Bar
                  dataKey="registered"
                  fill="var(--color-registered)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive
                >
                  <LabelList
                    dataKey="registered"
                    position="top"
                    formatter={chartCountLabel}
                    className="fill-foreground"
                    fontSize={10}
                  />
                </Bar>
              </ComposedChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="space-y-1">
            <CardTitle>New Leads Trend</CardTitle>
            <CardDescription>
              Leads created per{" "}
              {trendGranularity === "daily"
                ? "day"
                : trendGranularity === "weekly"
                  ? "week"
                  : "month"}{" "}
              in the selected period.
            </CardDescription>
          </div>
          <div className="no-print flex shrink-0 rounded-lg border p-0.5">
            {(["daily", "weekly", "monthly"] as const).map((granularity) => (
              <Button
                key={granularity}
                type="button"
                size="sm"
                variant={trendGranularity === granularity ? "secondary" : "ghost"}
                className="h-7 px-3 text-xs capitalize"
                onClick={() => setTrendGranularity(granularity)}
              >
                {granularity}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <EmptyChart label="No data for selected period" />
          ) : (
            <ChartContainer
              config={{ count: { label: "New leads", color: "hsl(var(--chart-2))" } }}
              className="h-[280px] w-full"
            >
              <AreaChart data={trendData} margin={{ left: 8, right: 8, top: 20, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  interval={trendGranularity === "daily" && trendData.length > 14 ? "preserveStartEnd" : 0}
                  angle={trendGranularity === "weekly" ? -18 : 0}
                  height={trendGranularity === "weekly" ? 48 : 30}
                  textAnchor={trendGranularity === "weekly" ? "end" : "middle"}
                />
                <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="count"
                  type="monotone"
                  fill="hsl(var(--chart-2))"
                  fillOpacity={0.2}
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  isAnimationActive
                >
                  {showTrendLabels ? (
                    <LabelList
                      dataKey="count"
                      position="top"
                      formatter={chartCountLabel}
                      className="fill-foreground"
                      fontSize={10}
                    />
                  ) : null}
                </Area>
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </ReportPrintable>
  );
}
