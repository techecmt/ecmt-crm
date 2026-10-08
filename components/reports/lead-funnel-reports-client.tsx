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
import { CheckCircle2, GraduationCap, UsersRound } from "lucide-react";

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
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
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
import { useLeads, type LeadWithRelations } from "@/lib/hooks/use-leads";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  downloadExcel,
  excelFilename,
  excelSheet,
} from "@/lib/reports/excel-export";
import { formatSgtDateTimeExport } from "@/lib/timezone";
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
  "withdrawn",
  "dropped",
  "on_discussions",
  "registered_closed",
  "registered_dropped_out",
]);

const COUNSELLING_COMPLETED_STATUSES = new Set<LeadStatus>([
  "counselling_completed",
  "registration_unpaid",
  "registered_paid_reg_fee",
  "withdrawn",
  "dropped",
  "registered_closed",
  "registered_dropped_out",
]);

const REGISTRATION_STATUSES = new Set<LeadStatus>([
  "registration_unpaid",
  "registered_paid_reg_fee",
  "withdrawn",
  "dropped",
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

const SOURCE_STACK_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(210 70% 46%)",
  "hsl(28 80% 52%)",
  "hsl(152 50% 38%)",
  "hsl(280 45% 50%)",
  "hsl(0 62% 50%)",
  "hsl(190 60% 40%)",
  "hsl(45 85% 46%)",
];

const COUNSELLOR_SOURCE_CHART_LIMIT = 12;

type CounsellorSourceMatrix = {
  counsellors: Array<{ id: string; name: string }>;
  sources: Array<{ id: LeadSource; name: string }>;
  cells: Map<string, number>;
  rowTotals: Map<string, number>;
  colTotals: Map<string, number>;
  grandTotal: number;
};

function counsellorSourceCellKey(counsellorId: string, source: LeadSource) {
  return `${counsellorId}::${source}`;
}

function counsellorNameFromLead(lead: LeadWithRelations) {
  if (!lead.assigned_counsellor) return "Unassigned";
  return lead.counsellor?.full_name || lead.counsellor?.email || "Unknown counsellor";
}

function buildCounsellorBySourceMatrix(leads: LeadWithRelations[]): CounsellorSourceMatrix {
  const counsellorMap = new Map<string, { id: string; name: string; total: number }>();
  const sourceMap = new Map<LeadSource, { id: LeadSource; name: string; total: number }>();
  const cells = new Map<string, number>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  let grandTotal = 0;

  for (const lead of leads) {
    const counsellorId = lead.assigned_counsellor ?? "unassigned";
    const counsellorName = counsellorNameFromLead(lead);
    const sourceId = lead.source;

    if (!counsellorMap.has(counsellorId)) {
      counsellorMap.set(counsellorId, { id: counsellorId, name: counsellorName, total: 0 });
    }
    counsellorMap.get(counsellorId)!.total += 1;

    if (!sourceMap.has(sourceId)) {
      sourceMap.set(sourceId, {
        id: sourceId,
        name: LEAD_SOURCE_LABELS[sourceId] ?? sourceId,
        total: 0,
      });
    }
    sourceMap.get(sourceId)!.total += 1;

    const key = counsellorSourceCellKey(counsellorId, sourceId);
    cells.set(key, (cells.get(key) ?? 0) + 1);
    rowTotals.set(counsellorId, (rowTotals.get(counsellorId) ?? 0) + 1);
    colTotals.set(sourceId, (colTotals.get(sourceId) ?? 0) + 1);
    grandTotal += 1;
  }

  return {
    counsellors: Array.from(counsellorMap.values())
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name })),
    sources: Array.from(sourceMap.values())
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name })),
    cells,
    rowTotals,
    colTotals,
    grandTotal,
  };
}

function CounsellorBySourceTable({
  matrix,
  emptyMessage,
}: {
  matrix: CounsellorSourceMatrix;
  emptyMessage: string;
}) {
  if (matrix.counsellors.length === 0 || matrix.sources.length === 0) {
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
              Counsellor
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
          {matrix.counsellors.map((counsellor) => {
            const rowTotal = matrix.rowTotals.get(counsellor.id) ?? 0;
            return (
              <TableRow key={counsellor.id}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium">
                  {counsellor.name}
                </TableCell>
                {matrix.sources.map((source) => {
                  const value =
                    matrix.cells.get(counsellorSourceCellKey(counsellor.id, source.id)) ?? 0;
                  return (
                    <TableCell key={source.id} className="text-right tabular-nums">
                      {value > 0 ? value : "—"}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-medium tabular-nums">{rowTotal}</TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-muted/30 font-semibold">
            <TableCell className="sticky left-0 z-10 bg-muted/30">Grand Total</TableCell>
            {matrix.sources.map((source) => {
              const colTotal = matrix.colTotals.get(source.id) ?? 0;
              return (
                <TableCell key={source.id} className="text-right tabular-nums">
                  {colTotal}
                </TableCell>
              );
            })}
            <TableCell className="text-right tabular-nums">{matrix.grandTotal}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

async function exportLeadFunnelExcel({
  fromDate,
  toDate,
  filterSummary,
  totalLeads,
  counsellingCompleted,
  registrations,
  funnelRows,
  statusData,
  sourcePerformanceData,
  counsellorBySourceMatrix,
  trendGranularity,
  trendData,
  leads,
}: {
  fromDate: string;
  toDate: string;
  filterSummary: string;
  totalLeads: number;
  counsellingCompleted: number;
  registrations: number;
  funnelRows: Array<{ key: string; name: string; count: number }>;
  statusData: Array<{ status: string; count: number }>;
  sourcePerformanceData: Array<{ source: string; created: number; registered: number }>;
  counsellorBySourceMatrix: CounsellorSourceMatrix;
  trendGranularity: TrendGranularity;
  trendData: Array<{ label: string; count: number }>;
  leads: LeadWithRelations[];
}) {
  const sourceHeaders = [
    "Counsellor",
    ...counsellorBySourceMatrix.sources.map((source) => source.name),
    "Total",
  ];
  const sourceRows = [
    ...counsellorBySourceMatrix.counsellors.map((counsellor) => [
      counsellor.name,
      ...counsellorBySourceMatrix.sources.map(
        (source) =>
          counsellorBySourceMatrix.cells.get(
            counsellorSourceCellKey(counsellor.id, source.id),
          ) ?? 0,
      ),
      counsellorBySourceMatrix.rowTotals.get(counsellor.id) ?? 0,
    ]),
    counsellorBySourceMatrix.counsellors.length > 0
      ? [
          "Grand Total",
          ...counsellorBySourceMatrix.sources.map(
            (source) => counsellorBySourceMatrix.colTotals.get(source.id) ?? 0,
          ),
          counsellorBySourceMatrix.grandTotal,
        ]
      : [],
  ].filter((row) => row.length > 0);

  await downloadExcel(
    excelFilename(["Lead_Funnel_Report", fromDate, "to", toDate]),
    [
      excelSheet("Summary", ["Metric", "Value"], [
        ["Period from", fromDate],
        ["Period to", toDate],
        ["Filters", filterSummary],
        ["Total leads", totalLeads],
        ["Counselling completed", counsellingCompleted],
        ["Registrations", registrations],
        ["Conversion rate %", percentValue(registrations, totalLeads)],
      ]),
      excelSheet(
        "Funnel",
        ["Stage", "Leads", "% of total", "From previous %"],
        funnelRows.map((row, index) => {
          const prev = index === 0 ? row.count : funnelRows[index - 1].count;
          return [
            row.name,
            row.count,
            percentValue(row.count, totalLeads),
            index === 0 ? "" : percentValue(row.count, prev),
          ];
        }),
      ),
      excelSheet(
        "Status",
        ["Status", "Leads"],
        statusData.map((row) => [row.status, row.count]),
      ),
      excelSheet(
        "Source",
        ["Source", "Leads created", "Registrations", "Conversion %"],
        sourcePerformanceData.map((row) => [
          row.source,
          row.created,
          row.registered,
          percentValue(row.registered, row.created),
        ]),
      ),
      excelSheet("Counsellor by Source", sourceHeaders, sourceRows),
      excelSheet(
        "Trend",
        [
          trendGranularity === "daily"
            ? "Day"
            : trendGranularity === "weekly"
              ? "Week"
              : "Month",
          "New leads",
        ],
        trendData.map((row) => [row.label, row.count]),
      ),
      excelSheet(
        "Leads",
        [
          "Name",
          "Phone",
          "Email",
          "Status",
          "Source",
          "College",
          "Course",
          "Counsellor",
          "Created at",
          "Counselling completed at",
          "Registration completed at",
        ],
        leads.map((lead) => [
          lead.full_name,
          lead.phone,
          lead.email ?? "",
          LEAD_STATUS_LABELS[lead.status] ?? lead.status,
          LEAD_SOURCE_LABELS[lead.source] ?? lead.source,
          lead.college?.name ?? "",
          lead.interested_course ?? "",
          counsellorNameFromLead(lead),
          formatSgtDateTimeExport(lead.created_at),
          lead.counselling_completed_at
            ? formatSgtDateTimeExport(lead.counselling_completed_at)
            : "",
          lead.registration_completed_at
            ? formatSgtDateTimeExport(lead.registration_completed_at)
            : "",
        ]),
        { minWidth: 16 },
      ),
    ],
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

function percentValue(part: number, whole: number) {
  if (whole === 0) return 0;
  return Number(((part / whole) * 100).toFixed(1));
}

function chartCountLabel(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return "";
  return String(count);
}

function chartCountLabelAll(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count)) return "";
  return String(count);
}

function chartPercentLabel(value: unknown) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return "";
  return `${percent.toFixed(1)}%`;
}

type TrendGranularity = "daily" | "weekly" | "monthly";
type TrendMode = "overall" | "by_source";

type TrendBucket = {
  key: string;
  label: string;
};

type TrendBySourceRow = { label: string; total: number } & Partial<Record<LeadSource, number>>;
type ConversionTrendRow = { label: string; created: number; registered: number; conversion: number };
type ConversionTrendBySourceRow = ConversionTrendRow & Partial<Record<LeadSource, number>>;

function defaultTrendGranularity(fromDate: string, toDate: string): TrendGranularity {
  const days = differenceInCalendarDays(new Date(toDate), new Date(fromDate));
  if (days > 90) return "monthly";
  if (days > 31) return "weekly";
  return "daily";
}

function trendBucketKey(date: Date, granularity: TrendGranularity) {
  if (granularity === "daily") return format(date, "yyyy-MM-dd");
  if (granularity === "weekly") {
    return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
  }
  return format(date, "yyyy-MM");
}

function buildTrendBuckets(from: Date, to: Date, granularity: TrendGranularity): TrendBucket[] {
  if (granularity === "daily") {
    return eachDayOfInterval({ start: from, end: to }).map((bucket) => ({
      key: format(bucket, "yyyy-MM-dd"),
      label: format(bucket, "d MMM"),
    }));
  }

  if (granularity === "weekly") {
    return eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 }).map((bucket) => {
      const weekEnd = endOfWeek(bucket, { weekStartsOn: 1 });
      return {
        key: format(bucket, "yyyy-MM-dd"),
        label: `${format(bucket, "d MMM")} – ${format(weekEnd, "d MMM")}`,
      };
    });
  }

  return eachMonthOfInterval({ start: from, end: to }).map((bucket) => ({
    key: format(bucket, "yyyy-MM"),
    label: format(bucket, "MMM yyyy"),
  }));
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

  const buckets = buildTrendBuckets(from, to, granularity);
  const counts = new Map<string, number>();

  for (const lead of leads) {
    const key = trendBucketKey(new Date(lead.created_at), granularity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    count: counts.get(bucket.key) ?? 0,
  }));
}

function buildTrendDataBySource(
  leads: Lead[],
  fromDate: string,
  toDate: string,
  granularity: TrendGranularity,
  sourceKeys: LeadSource[],
) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const buckets = buildTrendBuckets(from, to, granularity);
  const countsByBucket = new Map<string, Map<LeadSource, number>>();

  for (const lead of leads) {
    const bucket = trendBucketKey(new Date(lead.created_at), granularity);
    const sourceCounts = countsByBucket.get(bucket) ?? new Map<LeadSource, number>();
    sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);
    countsByBucket.set(bucket, sourceCounts);
  }

  return buckets.map((bucket) => {
    const sourceCounts = countsByBucket.get(bucket.key);
    const row: TrendBySourceRow = { label: bucket.label, total: 0 };

    for (const sourceKey of sourceKeys) {
      const count = sourceCounts?.get(sourceKey) ?? 0;
      row[sourceKey] = count;
      row.total += count;
    }

    return row;
  });
}

function buildTrendSourceConfig(sourceKeys: LeadSource[]): ChartConfig {
  return sourceKeys.reduce<ChartConfig>((acc, sourceKey, index) => {
    acc[sourceKey] = {
      label: LEAD_SOURCE_LABELS[sourceKey] ?? sourceKey,
      color: SOURCE_STACK_COLORS[index % SOURCE_STACK_COLORS.length],
    };
    return acc;
  }, {});
}

function trendSourceTooltipLabelFormatter(label: string, payload: unknown[]) {
  const row = (payload[0] as { payload?: { total?: number } })?.payload;
  return (
    <div className="space-y-1">
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground">Total leads: {row?.total ?? 0}</div>
    </div>
  );
}

function buildConversionTrendData(
  leads: Lead[],
  fromDate: string,
  toDate: string,
  granularity: TrendGranularity,
): ConversionTrendRow[] {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const buckets = buildTrendBuckets(from, to, granularity);
  const createdCounts = new Map<string, number>();
  const registeredCounts = new Map<string, number>();

  for (const lead of leads) {
    const bucketKey = trendBucketKey(new Date(lead.created_at), granularity);
    createdCounts.set(bucketKey, (createdCounts.get(bucketKey) ?? 0) + 1);
    if (isLeadRegistered(lead)) {
      registeredCounts.set(bucketKey, (registeredCounts.get(bucketKey) ?? 0) + 1);
    }
  }

  return buckets.map((bucket) => {
    const created = createdCounts.get(bucket.key) ?? 0;
    const registered = registeredCounts.get(bucket.key) ?? 0;
    return {
      label: bucket.label,
      created,
      registered,
      conversion: percentValue(registered, created),
    };
  });
}

function buildConversionTrendBySourceData(
  leads: Lead[],
  fromDate: string,
  toDate: string,
  granularity: TrendGranularity,
  sourceKeys: LeadSource[],
): ConversionTrendBySourceRow[] {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const buckets = buildTrendBuckets(from, to, granularity);
  const createdCounts = new Map<string, number>();
  const registeredCounts = new Map<string, number>();
  const createdBySource = new Map<string, Map<LeadSource, number>>();

  for (const lead of leads) {
    const bucketKey = trendBucketKey(new Date(lead.created_at), granularity);
    createdCounts.set(bucketKey, (createdCounts.get(bucketKey) ?? 0) + 1);

    const sourceCounts = createdBySource.get(bucketKey) ?? new Map<LeadSource, number>();
    sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);
    createdBySource.set(bucketKey, sourceCounts);

    if (isLeadRegistered(lead)) {
      registeredCounts.set(bucketKey, (registeredCounts.get(bucketKey) ?? 0) + 1);
    }
  }

  return buckets.map((bucket) => {
    const created = createdCounts.get(bucket.key) ?? 0;
    const registered = registeredCounts.get(bucket.key) ?? 0;
    const row: ConversionTrendBySourceRow = {
      label: bucket.label,
      created,
      registered,
      conversion: percentValue(registered, created),
    };

    const sourceCounts = createdBySource.get(bucket.key);
    for (const sourceKey of sourceKeys) {
      row[sourceKey] = sourceCounts?.get(sourceKey) ?? 0;
    }

    return row;
  });
}

function conversionTrendTooltipLabelFormatter(label: string, payload: unknown[]) {
  const row = (payload[0] as { payload?: { created?: number; registered?: number; conversion?: number } })
    ?.payload;
  return (
    <div className="space-y-1">
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground">
        Created: {row?.created ?? 0} | Registered: {row?.registered ?? 0} | Conversion:{" "}
        {Number(row?.conversion ?? 0).toFixed(1)}%
      </div>
    </div>
  );
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
  const [collegeIds, setCollegeIds] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState<LeadSource[]>([]);
  // Default to the logged-in user's own pipeline. Admins can add more via the
  // Counsellor filter; non-admins stay scoped to themselves.
  const [counsellorIds, setCounsellorIds] = React.useState<string[]>([currentUserId]);
  const [appliedFilters, setAppliedFilters] = React.useState(() => ({
    fromDate: format(subDays(now, 29), "yyyy-MM-dd"),
    toDate: format(now, "yyyy-MM-dd"),
    collegeIds: [] as string[],
    sources: [] as LeadSource[],
    counsellorIds: [currentUserId],
  }));

  const leadsQuery = useLeads({
    collegeIds: appliedFilters.collegeIds.length > 0 ? appliedFilters.collegeIds : undefined,
    sources: appliedFilters.sources.length > 0 ? appliedFilters.sources : undefined,
    counsellorIds: isAdmin
      ? appliedFilters.counsellorIds.length > 0
        ? appliedFilters.counsellorIds
        : undefined
      : [currentUserId],
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

  const counsellorBySourceMatrix = React.useMemo(
    () => buildCounsellorBySourceMatrix(leads),
    [leads],
  );

  const counsellorBySourceChart = React.useMemo(() => {
    const chartCounsellors = counsellorBySourceMatrix.counsellors.slice(
      0,
      COUNSELLOR_SOURCE_CHART_LIMIT,
    );
    const config: ChartConfig = Object.fromEntries(
      counsellorBySourceMatrix.sources.map((source, index) => [
        source.id,
        {
          label: source.name,
          color: SOURCE_STACK_COLORS[index % SOURCE_STACK_COLORS.length],
        },
      ]),
    );
    const data = chartCounsellors.map((counsellor) => {
      const row: Record<string, string | number> = {
        counsellor: truncateChartLabel(counsellor.name, 18),
        counsellorFull: counsellor.name,
        total: counsellorBySourceMatrix.rowTotals.get(counsellor.id) ?? 0,
      };
      for (const source of counsellorBySourceMatrix.sources) {
        row[source.id] =
          counsellorBySourceMatrix.cells.get(
            counsellorSourceCellKey(counsellor.id, source.id),
          ) ?? 0;
      }
      return row;
    });
    return {
      config,
      data,
      truncated:
        counsellorBySourceMatrix.counsellors.length > COUNSELLOR_SOURCE_CHART_LIMIT,
    };
  }, [counsellorBySourceMatrix]);

  const defaultGranularity = React.useMemo(
    () =>
      defaultTrendGranularity(
        appliedFilters.fromDate,
        appliedFilters.toDate,
      ),
    [appliedFilters.fromDate, appliedFilters.toDate],
  );
  const [trendGranularity, setTrendGranularity] = React.useState<TrendGranularity>("daily");
  const [trendMode, setTrendMode] = React.useState<TrendMode>("overall");
  const [conversionTrendGranularity, setConversionTrendGranularity] =
    React.useState<TrendGranularity>("daily");
  const [conversionTrendMode, setConversionTrendMode] = React.useState<TrendMode>("overall");

  React.useEffect(() => {
    setTrendGranularity(defaultGranularity);
    setConversionTrendGranularity(defaultGranularity);
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

  const trendSourceKeys = React.useMemo<LeadSource[]>(
    () => sourcePerformanceData.map((row) => row.key as LeadSource),
    [sourcePerformanceData],
  );
  const trendBySourceData = React.useMemo(
    () =>
      buildTrendDataBySource(
        leads,
        appliedFilters.fromDate,
        appliedFilters.toDate,
        trendGranularity,
        trendSourceKeys,
      ),
    [
      appliedFilters.fromDate,
      appliedFilters.toDate,
      leads,
      trendGranularity,
      trendSourceKeys,
    ],
  );
  const trendChartConfig = React.useMemo<ChartConfig>(
    () =>
      trendMode === "overall"
        ? { count: { label: "New leads", color: "hsl(var(--chart-2))" } }
        : buildTrendSourceConfig(trendSourceKeys),
    [trendMode, trendSourceKeys],
  );
  const trendRows = React.useMemo<Array<Record<string, string | number>>>(
    () =>
      trendMode === "overall"
        ? trendData.map((row) => ({ label: row.label, count: row.count }))
        : trendBySourceData.map((row) => ({ ...row })),
    [trendBySourceData, trendData, trendMode],
  );
  const hasTrendData =
    trendMode === "overall" ? trendData.length > 0 : trendBySourceData.some((row) => row.total > 0);
  const trendBySourceTotals = React.useMemo(() => {
    const sourceTotals: Partial<Record<LeadSource, number>> = {};
    let grandTotal = 0;
    for (const sourceKey of trendSourceKeys) {
      sourceTotals[sourceKey] = 0;
    }
    for (const row of trendBySourceData) {
      grandTotal += row.total;
      for (const sourceKey of trendSourceKeys) {
        sourceTotals[sourceKey] = (sourceTotals[sourceKey] ?? 0) + (row[sourceKey] ?? 0);
      }
    }
    return { sourceTotals, grandTotal };
  }, [trendBySourceData, trendSourceKeys]);

  const conversionTrendData = React.useMemo(
    () =>
      buildConversionTrendData(
        leads,
        appliedFilters.fromDate,
        appliedFilters.toDate,
        conversionTrendGranularity,
      ),
    [
      appliedFilters.fromDate,
      appliedFilters.toDate,
      leads,
      conversionTrendGranularity,
    ],
  );
  const conversionTrendBySourceData = React.useMemo(
    () =>
      buildConversionTrendBySourceData(
        leads,
        appliedFilters.fromDate,
        appliedFilters.toDate,
        conversionTrendGranularity,
        trendSourceKeys,
      ),
    [
      appliedFilters.fromDate,
      appliedFilters.toDate,
      leads,
      conversionTrendGranularity,
      trendSourceKeys,
    ],
  );
  const conversionTrendChartConfig = React.useMemo<ChartConfig>(
    () =>
      conversionTrendMode === "overall"
        ? { conversion: { label: "Conversion %", color: "hsl(var(--chart-4))" } }
        : buildTrendSourceConfig(trendSourceKeys),
    [conversionTrendMode, trendSourceKeys],
  );
  const conversionTrendRows =
    conversionTrendMode === "overall" ? conversionTrendData : conversionTrendBySourceData;
  const hasConversionTrendData = conversionTrendRows.some((row) => row.created > 0);
  const conversionTrendTotals = React.useMemo(() => {
    const created = conversionTrendRows.reduce((sum, row) => sum + row.created, 0);
    const registered = conversionTrendRows.reduce((sum, row) => sum + row.registered, 0);
    return {
      created,
      registered,
      conversion: percentValue(registered, created),
    };
  }, [conversionTrendRows]);

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
    const collegeLabels =
      appliedFilters.collegeIds.length > 0
        ? appliedFilters.collegeIds.map(
            (id) => collegesQuery.data?.find((c) => c.id === id)?.name ?? id,
          )
        : [];
    const sourceLabels =
      appliedFilters.sources.length > 0
        ? appliedFilters.sources.map((src) => LEAD_SOURCE_LABELS[src])
        : [];
    const selectedCounsellorIds = isAdmin
      ? appliedFilters.counsellorIds
      : [currentUserId];
    const counsellorLabels =
      selectedCounsellorIds.length > 0
        ? selectedCounsellorIds.map((id) => {
            const profile = counsellorOptions.find((p) => p.id === id);
            return profile?.full_name || profile?.email || id;
          })
        : [];

    return joinFilterParts([
      `Period: ${appliedFilters.fromDate} to ${appliedFilters.toDate}`,
      collegeLabels.length > 0 ? `Colleges: ${collegeLabels.join(", ")}` : null,
      sourceLabels.length > 0 ? `Sources: ${sourceLabels.join(", ")}` : null,
      counsellorLabels.length > 0
        ? `Counsellors: ${counsellorLabels.join(", ")}`
        : null,
    ]);
  }, [
    appliedFilters,
    collegesQuery.data,
    counsellorOptions,
    currentUserId,
    isAdmin,
  ]);

  const handleExportExcel = () =>
    exportLeadFunnelExcel({
      fromDate: appliedFilters.fromDate,
      toDate: appliedFilters.toDate,
      filterSummary,
      totalLeads,
      counsellingCompleted,
      registrations,
      funnelRows,
      statusData,
      sourcePerformanceData,
      counsellorBySourceMatrix,
      trendGranularity,
      trendData,
      leads,
    });

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
      onExportExcel={handleExportExcel}
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
            <MultiSelectFilter
              options={(collegesQuery.data ?? []).map((college) => ({
                value: college.id,
                label: college.name,
              }))}
              selected={collegeIds}
              onChange={setCollegeIds}
              placeholder="All colleges"
              allLabel="All colleges"
              searchPlaceholder="Search colleges…"
              emptyMessage="No colleges found."
            />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Source</label>
            <MultiSelectFilter
              options={(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((src) => ({
                value: src,
                label: LEAD_SOURCE_LABELS[src],
              }))}
              selected={sources}
              onChange={(values) => setSources(values as LeadSource[])}
              placeholder="All sources"
              allLabel="All sources"
              searchPlaceholder="Search sources…"
              emptyMessage="No sources found."
            />
          </div>
          {isAdmin ? (
            <div className="grid w-full gap-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Counsellor</label>
              <MultiSelectFilter
                options={counsellorOptions.map((p) => ({
                  value: p.id,
                  label: p.full_name || p.email,
                }))}
                selected={counsellorIds}
                onChange={setCounsellorIds}
                placeholder="All counsellors"
                allLabel="All counsellors"
                searchPlaceholder="Search counsellors…"
                emptyMessage="No counsellors found."
              />
            </div>
          ) : null}
          <Button
            type="button"
            onClick={() =>
              setAppliedFilters({
                fromDate,
                toDate,
                collegeIds,
                sources,
                counsellorIds: isAdmin ? counsellorIds : [currentUserId],
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
              setCollegeIds([]);
              setSources([]);
              setCounsellorIds([currentUserId]);
            }}
          >
            Reset filters
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="space-y-1">
            <CardTitle>Conversion Rate Trend</CardTitle>
            <CardDescription>
              Inquiry to registration conversion per{" "}
              {conversionTrendGranularity === "daily"
                ? "day"
                : conversionTrendGranularity === "weekly"
                  ? "week"
                  : "month"}
              {conversionTrendMode === "by_source" ? " with source-wise lead contribution" : ""}.
            </CardDescription>
          </div>
          <div className="no-print flex shrink-0 flex-col gap-2 sm:items-end">
            <div className="flex rounded-lg border p-0.5">
              {(["daily", "weekly", "monthly"] as const).map((granularity) => (
                <Button
                  key={granularity}
                  type="button"
                  size="sm"
                  variant={conversionTrendGranularity === granularity ? "secondary" : "ghost"}
                  className="h-7 px-3 text-xs capitalize"
                  onClick={() => setConversionTrendGranularity(granularity)}
                >
                  {granularity}
                </Button>
              ))}
            </div>
            <div className="flex rounded-lg border p-0.5">
              {([
                { id: "overall" as const, label: "Overall" },
                { id: "by_source" as const, label: "By source" },
              ] satisfies Array<{ id: TrendMode; label: string }>).map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={conversionTrendMode === option.id ? "secondary" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setConversionTrendMode(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasConversionTrendData ? (
            <EmptyChart label="No leads in selected period" />
          ) : (
            <>
              <ChartContainer config={conversionTrendChartConfig} className="h-[300px] w-full">
                <AreaChart data={conversionTrendRows} margin={{ left: 8, right: 8, top: 20, bottom: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={11}
                    interval={
                      conversionTrendGranularity === "daily" && conversionTrendRows.length > 14
                        ? "preserveStartEnd"
                        : 0
                    }
                    angle={conversionTrendGranularity === "weekly" ? -18 : 0}
                    height={conversionTrendGranularity === "weekly" ? 48 : 30}
                    textAnchor={conversionTrendGranularity === "weekly" ? "end" : "middle"}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    allowDecimals={false}
                    domain={conversionTrendMode === "overall" ? [0, 100] : undefined}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        indicator={conversionTrendMode === "overall" ? "dot" : "line"}
                        labelFormatter={conversionTrendTooltipLabelFormatter}
                      />
                    }
                  />
                  {conversionTrendMode === "by_source" ? <ChartLegend content={<ChartLegendContent />} /> : null}
                  {conversionTrendMode === "overall" ? (
                    <Area
                      dataKey="conversion"
                      type="monotone"
                      fill="hsl(var(--chart-4))"
                      fillOpacity={0.2}
                      stroke="hsl(var(--chart-4))"
                      strokeWidth={2}
                      dot={{
                        r: 3,
                        strokeWidth: 1,
                        stroke: "hsl(var(--chart-4))",
                        fill: "hsl(var(--background))",
                      }}
                      activeDot={{ r: 4, strokeWidth: 1, stroke: "hsl(var(--chart-4))" }}
                      isAnimationActive
                    >
                      <LabelList
                        dataKey="conversion"
                        position="top"
                        formatter={chartPercentLabel}
                        className="fill-foreground"
                        fontSize={10}
                      />
                    </Area>
                  ) : (
                    trendSourceKeys.map((sourceKey) => (
                      <Area
                        key={sourceKey}
                        dataKey={sourceKey}
                        type="monotone"
                        stackId="sources"
                        fill={`var(--color-${sourceKey})`}
                        fillOpacity={0.22}
                        stroke={`var(--color-${sourceKey})`}
                        strokeWidth={1.6}
                        dot={{
                          r: 2.5,
                          strokeWidth: 1,
                          stroke: `var(--color-${sourceKey})`,
                          fill: "hsl(var(--background))",
                        }}
                        activeDot={{ r: 3.5, strokeWidth: 1, stroke: `var(--color-${sourceKey})` }}
                        isAnimationActive
                      >
                        <LabelList
                          dataKey={sourceKey}
                          position="top"
                          formatter={chartCountLabelAll}
                          className="fill-foreground"
                          fontSize={9}
                        />
                      </Area>
                    ))
                  )}
                </AreaChart>
              </ChartContainer>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {conversionTrendGranularity === "daily"
                          ? "Day"
                          : conversionTrendGranularity === "weekly"
                            ? "Week"
                            : "Month"}
                      </TableHead>
                      <TableHead className="text-right">Created</TableHead>
                      <TableHead className="text-right">Registered</TableHead>
                      <TableHead className="text-right">Conversion %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversionTrendRows.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.created}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.registered}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.conversion.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{conversionTrendTotals.created}</TableCell>
                      <TableCell className="text-right tabular-nums">{conversionTrendTotals.registered}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {conversionTrendTotals.conversion.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
        <CardHeader>
          <CardTitle>Counsellor by Source</CardTitle>
          <CardDescription>
            Lead counts for each counsellor by inquiry source in the selected period.
            {counsellorBySourceChart.truncated
              ? ` Chart shows the top ${COUNSELLOR_SOURCE_CHART_LIMIT} counsellors; the table includes everyone.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {counsellorBySourceMatrix.grandTotal === 0 ? (
            <EmptyChart label="No leads in selected period" />
          ) : (
            <>
              <ChartContainer
                config={counsellorBySourceChart.config}
                className="aspect-auto w-full"
                style={{
                  height: Math.max(280, counsellorBySourceChart.data.length * 44 + 48),
                }}
              >
                <BarChart
                  data={counsellorBySourceChart.data}
                  layout="vertical"
                  margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="counsellor"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value, payload) => {
                          const first = payload?.[0] as
                            | { payload?: { counsellorFull?: string } }
                            | undefined;
                          return first?.payload?.counsellorFull ?? String(value ?? "");
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  {counsellorBySourceMatrix.sources.map((source, index) => (
                    <Bar
                      key={source.id}
                      dataKey={source.id}
                      stackId="leads"
                      fill={`var(--color-${source.id})`}
                      radius={
                        index === counsellorBySourceMatrix.sources.length - 1
                          ? [0, 4, 4, 0]
                          : [0, 0, 0, 0]
                      }
                      maxBarSize={28}
                    />
                  ))}
                </BarChart>
              </ChartContainer>
              <CounsellorBySourceTable
                matrix={counsellorBySourceMatrix}
                emptyMessage="No leads in selected period"
              />
            </>
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
                  : "month"}
              {trendMode === "by_source" ? ", split by source" : ""} in the selected period.
            </CardDescription>
          </div>
          <div className="no-print flex shrink-0 flex-col gap-2 sm:items-end">
            <div className="flex rounded-lg border p-0.5">
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
            <div className="flex rounded-lg border p-0.5">
              {([
                { id: "overall" as const, label: "Overall" },
                { id: "by_source" as const, label: "By source" },
              ] satisfies Array<{ id: TrendMode; label: string }>).map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={trendMode === option.id ? "secondary" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setTrendMode(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasTrendData ? (
            <EmptyChart label="No data for selected period" />
          ) : (
            <>
              <ChartContainer
                config={trendChartConfig}
                className="h-[280px] w-full"
              >
                <AreaChart data={trendRows} margin={{ left: 8, right: 8, top: 20, bottom: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={11}
                    interval={
                      trendGranularity === "daily" && trendRows.length > 14
                        ? "preserveStartEnd"
                        : 0
                    }
                    angle={trendGranularity === "weekly" ? -18 : 0}
                    height={trendGranularity === "weekly" ? 48 : 30}
                    textAnchor={trendGranularity === "weekly" ? "end" : "middle"}
                  />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                  <ChartTooltip
                    content={
                      trendMode === "overall" ? (
                        <ChartTooltipContent />
                      ) : (
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={trendSourceTooltipLabelFormatter}
                        />
                      )
                    }
                  />
                  {trendMode === "by_source" ? <ChartLegend content={<ChartLegendContent />} /> : null}
                  {trendMode === "overall" ? (
                    <Area
                      dataKey="count"
                      type="monotone"
                      fill="hsl(var(--chart-2))"
                      fillOpacity={0.2}
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 1, stroke: "hsl(var(--chart-2))", fill: "hsl(var(--background))" }}
                      activeDot={{ r: 4, strokeWidth: 1, stroke: "hsl(var(--chart-2))" }}
                      isAnimationActive
                    >
                      <LabelList
                        dataKey="count"
                        position="top"
                        formatter={chartCountLabel}
                        className="fill-foreground"
                        fontSize={10}
                      />
                    </Area>
                  ) : (
                    trendSourceKeys.map((sourceKey) => (
                      <Area
                        key={sourceKey}
                        dataKey={sourceKey}
                        type="monotone"
                        stackId="sources"
                        fill={`var(--color-${sourceKey})`}
                        fillOpacity={0.22}
                        stroke={`var(--color-${sourceKey})`}
                        strokeWidth={1.6}
                        dot={{
                          r: 2.5,
                          strokeWidth: 1,
                          stroke: `var(--color-${sourceKey})`,
                          fill: "hsl(var(--background))",
                        }}
                        activeDot={{ r: 3.5, strokeWidth: 1, stroke: `var(--color-${sourceKey})` }}
                        isAnimationActive
                      >
                        <LabelList
                          dataKey={sourceKey}
                          position="top"
                          formatter={chartCountLabel}
                          className="fill-foreground"
                          fontSize={9}
                        />
                      </Area>
                    ))
                  )}
                </AreaChart>
              </ChartContainer>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    {trendMode === "overall" ? (
                      <TableRow>
                        <TableHead>{trendGranularity === "daily" ? "Day" : trendGranularity === "weekly" ? "Week" : "Month"}</TableHead>
                        <TableHead className="text-right">New leads</TableHead>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableHead>{trendGranularity === "daily" ? "Day" : trendGranularity === "weekly" ? "Week" : "Month"}</TableHead>
                        {trendSourceKeys.map((sourceKey) => (
                          <TableHead key={sourceKey} className="text-right">
                            {LEAD_SOURCE_LABELS[sourceKey] ?? sourceKey}
                          </TableHead>
                        ))}
                        <TableHead className="text-right font-semibold">Total</TableHead>
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {trendMode === "overall"
                      ? trendData.map((row) => (
                          <TableRow key={row.label}>
                            <TableCell>{row.label}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                          </TableRow>
                        ))
                      : trendBySourceData.map((row) => (
                          <TableRow key={row.label}>
                            <TableCell>{row.label}</TableCell>
                            {trendSourceKeys.map((sourceKey) => (
                              <TableCell key={sourceKey} className="text-right tabular-nums">
                                {row[sourceKey] ?? 0}
                              </TableCell>
                            ))}
                            <TableCell className="text-right tabular-nums font-medium">{row.total}</TableCell>
                          </TableRow>
                        ))}
                    {trendMode === "overall" ? (
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {trendData.reduce((sum, row) => sum + row.count, 0)}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell>Total</TableCell>
                        {trendSourceKeys.map((sourceKey) => (
                          <TableCell key={sourceKey} className="text-right tabular-nums">
                            {trendBySourceTotals.sourceTotals[sourceKey] ?? 0}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">
                          {trendBySourceTotals.grandTotal}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </ReportPrintable>
  );
}
