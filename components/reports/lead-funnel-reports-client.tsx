"use client";

import * as React from "react";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  format,
  subDays,
} from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Pie,
  PieChart,
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

const REGISTERED_PAID_STATUSES = new Set<LeadStatus>([
  "registered_paid_reg_fee",
  "registered_closed",
]);

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
    key: "registration",
    label: "Registration",
    matches: (lead) =>
      REGISTRATION_STATUSES.has(lead.status) || !!lead.registration_completed_at,
  },
  {
    key: "registered_paid",
    label: "Registered (Paid)",
    matches: (lead) => REGISTERED_PAID_STATUSES.has(lead.status),
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

  const leadsQuery = useLeads({
    collegeId,
    source,
    counsellorId: isAdmin ? counsellorId : currentUserId,
  });
  const collegesQuery = useColleges();
  const profilesQuery = useProfiles();

  const leads = React.useMemo(() => {
    const all = leadsQuery.data ?? [];
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
    return all.filter((lead) => {
      const createdAt = new Date(lead.created_at);
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      return true;
    });
  }, [leadsQuery.data, fromDate, toDate]);

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

  const sourceData = React.useMemo(
    () =>
      (Object.keys(LEAD_SOURCE_LABELS) as LeadSource[])
        .map((src, index) => ({
          key: src,
          label: LEAD_SOURCE_LABELS[src],
          value: leads.filter((l) => l.source === src).length,
          fill: FUNNEL_COLORS[index % FUNNEL_COLORS.length],
        }))
        .filter((row) => row.value > 0),
    [leads],
  );

  const sourceConfig: ChartConfig = React.useMemo(
    () =>
      sourceData.reduce<ChartConfig>(
        (acc, cur) => ({ ...acc, [cur.key]: { label: cur.label, color: cur.fill } }),
        {},
      ),
    [sourceData],
  );

  const trendData = React.useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];
    const byMonth = differenceInCalendarDays(to, from) > 62;
    const buckets = byMonth
      ? eachMonthOfInterval({ start: from, end: to })
      : eachDayOfInterval({ start: from, end: to });
    const bucketKey = (d: Date) => format(d, byMonth ? "yyyy-MM" : "yyyy-MM-dd");
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const key = bucketKey(new Date(lead.created_at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return buckets.map((bucket) => ({
      label: format(bucket, byMonth ? "MMM yyyy" : "d MMM"),
      count: counts.get(bucketKey(bucket)) ?? 0,
    }));
  }, [leads, fromDate, toDate]);

  const totalLeads = funnelRows[0]?.count ?? 0;
  const counsellingCompleted =
    funnelRows.find((r) => r.key === "counselling_completed")?.count ?? 0;
  const registeredPaid = funnelRows.find((r) => r.key === "registered_paid")?.count ?? 0;

  const counsellorOptions = (profilesQuery.data ?? []).filter(
    (p) =>
      p.is_active &&
      ["counsellor", "admission_manager", "management", "super_admin"].includes(p.role),
  );

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
    <div className="space-y-6">
      <Card>
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
          label="Registered (Paid)"
          value={registeredPaid}
          hint={`${percent(registeredPaid, totalLeads)} of leads`}
          icon={<GraduationCap className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Conversion Rate"
          value={percent(registeredPaid, totalLeads)}
          hint="Inquiry → paid registration"
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
                <BarChart data={statusData} margin={{ left: 8, right: 8 }}>
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
                  <Bar dataKey="count" radius={4} fill="hsl(var(--chart-1))" />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads by Source</CardTitle>
            <CardDescription>Where leads in the period came from.</CardDescription>
          </CardHeader>
          <CardContent>
            {sourceData.length === 0 ? (
              <EmptyChart label="No leads in selected period" />
            ) : (
              <ChartContainer config={sourceConfig} className="h-[280px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={sourceData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={50}
                    outerRadius={90}
                    strokeWidth={2}
                  >
                    {sourceData.map((s) => (
                      <Cell key={s.key} fill={s.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Leads Trend</CardTitle>
          <CardDescription>
            Leads created per {differenceInCalendarDays(new Date(toDate), new Date(fromDate)) > 62 ? "month" : "day"} in the selected period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <EmptyChart label="No data for selected period" />
          ) : (
            <ChartContainer
              config={{ count: { label: "New leads", color: "hsl(var(--chart-2))" } }}
              className="h-[240px] w-full"
            >
              <AreaChart data={trendData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="count"
                  type="monotone"
                  fill="hsl(var(--chart-2))"
                  fillOpacity={0.2}
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
