"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  GraduationCap,
  Minus,
  TrendingUp,
  UserCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import writeXlsxFile, { type SheetData } from "write-excel-file/browser";

import {
  joinFilterParts,
  ReportPrintable,
} from "@/components/reports/report-printable";
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
  type DimensionComparisonRow,
  type PeriodMetrics,
  useComparisonReport,
} from "@/lib/hooks/use-comparison-report";
import {
  COMPARISON_PRESET_LABELS,
  type ComparisonPreset,
  type DateRange,
  formatDateRangeCompact,
  formatDateRangeLabel,
  getPresetComparison,
  isValidDateRange,
  previousEqualPeriod,
} from "@/lib/reports/comparison-periods";
import { LEAD_SOURCE_LABELS, type LeadSource } from "@/lib/types";
import { cn } from "@/lib/utils";

type PeriodMode = "auto" | "custom";

const PRESETS: ComparisonPreset[] = ["last7", "last30", "mom", "qoq", "yoy"];

function buildChartConfig(periodALabel: string, periodBLabel: string): ChartConfig {
  return {
    periodA: { label: periodALabel, color: "hsl(var(--chart-1))" },
    periodB: { label: periodBLabel, color: "hsl(var(--chart-2))" },
  };
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function formatPct(value: number | null, digits = 1) {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatNumber(value: number, digits = 0) {
  return value.toLocaleString("en-SG", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function chartCountLabel(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return "";
  return String(count);
}

function DeltaBadge({
  current,
  previous,
  invert = false,
}: {
  current: number;
  previous: number;
  invert?: boolean;
}) {
  const change = percentChange(current, previous);
  if (change === null) {
    return (
      <Badge variant="secondary" className="font-normal">
        New
      </Badge>
    );
  }
  if (Math.abs(change) < 0.05) {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
        <Minus className="h-3 w-3" />
        0%
      </Badge>
    );
  }

  const isUp = change > 0;
  const isPositive = invert ? !isUp : isUp;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-normal",
        isPositive
          ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
          : "border-rose-200 text-rose-700 dark:border-rose-800 dark:text-rose-400",
      )}
    >
      {isUp ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {formatPct(change)}
    </Badge>
  );
}

function ComparisonMetricCard({
  label,
  periodA,
  periodB,
  periodALabel,
  periodBLabel,
  format = "number",
  icon,
  hint,
}: {
  label: string;
  periodA: number;
  periodB: number;
  periodALabel: string;
  periodBLabel: string;
  format?: "number" | "percent";
  icon: React.ReactNode;
  hint?: string;
}) {
  const displayA =
    format === "percent" ? `${periodA.toFixed(1)}%` : formatNumber(periodA);
  const displayB =
    format === "percent" ? `${periodB.toFixed(1)}%` : formatNumber(periodB);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-semibold tabular-nums">{displayA}</div>
            <p className="text-xs text-muted-foreground">{periodALabel}</p>
          </div>
          <DeltaBadge current={periodA} previous={periodB} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{periodBLabel}</span>
          <span className="tabular-nums">{displayB}</span>
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function DimensionComparisonTable({
  labelColumn,
  rows,
  emptyMessage,
  sourceLabels = false,
  periodALabel,
  periodBLabel,
}: {
  labelColumn: string;
  rows: DimensionComparisonRow[];
  emptyMessage: string;
  sourceLabels?: boolean;
  periodALabel: string;
  periodBLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[140px]">{labelColumn}</TableHead>
            <TableHead className="min-w-[88px] text-right">Leads ({periodALabel})</TableHead>
            <TableHead className="min-w-[88px] text-right">Leads ({periodBLabel})</TableHead>
            <TableHead className="text-right">Δ Leads</TableHead>
            <TableHead className="min-w-[88px] text-right">Couns. ({periodALabel})</TableHead>
            <TableHead className="min-w-[88px] text-right">Couns. ({periodBLabel})</TableHead>
            <TableHead className="min-w-[100px] text-right">Regs ({periodALabel})</TableHead>
            <TableHead className="min-w-[100px] text-right">Regs ({periodBLabel})</TableHead>
            <TableHead className="min-w-[80px] text-right">Paid ({periodALabel})</TableHead>
            <TableHead className="min-w-[80px] text-right">Paid ({periodBLabel})</TableHead>
            <TableHead className="min-w-[80px] text-right">Conv. ({periodALabel})</TableHead>
            <TableHead className="min-w-[80px] text-right">Conv. ({periodBLabel})</TableHead>
            <TableHead className="text-right">Δ Conv.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const name =
              sourceLabels
                ? (LEAD_SOURCE_LABELS[row.id as LeadSource] ?? row.name)
                : row.name;
            const leadChange = percentChange(
              row.periodA.leadsCreated,
              row.periodB.leadsCreated,
            );
            const convChange = percentChange(
              row.periodA.conversionRate,
              row.periodB.conversionRate,
            );
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodA.leadsCreated}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodB.leadsCreated}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPct(leadChange)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodA.counsellingCompleted}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodB.counsellingCompleted}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodA.registrationsTotal}
                  <span className="text-muted-foreground">
                    {" "}
                    ({row.periodA.registrationsUnpaid}U/{row.periodA.registrationsPaid}P)
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodB.registrationsTotal}
                  <span className="text-muted-foreground">
                    {" "}
                    ({row.periodB.registrationsUnpaid}U/{row.periodB.registrationsPaid}P)
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodA.registrationsPaid}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodB.registrationsPaid}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodA.conversionRate.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.periodB.conversionRate.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPct(convChange)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function buildKpiChartData(periodA: PeriodMetrics, periodB: PeriodMetrics) {
  return [
    {
      metric: "Leads",
      periodA: periodA.leadsCreated,
      periodB: periodB.leadsCreated,
    },
    {
      metric: "Counselling",
      periodA: periodA.counsellingCompleted,
      periodB: periodB.counsellingCompleted,
    },
    {
      metric: "Regs (event)",
      periodA: periodA.registrationsTotal,
      periodB: periodB.registrationsTotal,
    },
    {
      metric: "Paid",
      periodA: periodA.registrationsPaid,
      periodB: periodB.registrationsPaid,
    },
    {
      metric: "Unpaid",
      periodA: periodA.registrationsUnpaid,
      periodB: periodB.registrationsUnpaid,
    },
  ];
}

function buildSourceChartData(rows: DimensionComparisonRow[]) {
  return rows
    .slice(0, 8)
    .map((row) => ({
      source: LEAD_SOURCE_LABELS[row.id as LeadSource] ?? row.name,
      periodA: row.periodA.leadsCreated,
      periodB: row.periodB.leadsCreated,
    }));
}

async function exportComparisonExcel({
  periodA,
  periodB,
  periodAMetrics,
  periodBMetrics,
  bySource,
  byCollege,
  byCourse,
  byCounsellor,
}: {
  periodA: DateRange;
  periodB: DateRange;
  periodAMetrics: PeriodMetrics;
  periodBMetrics: PeriodMetrics;
  bySource: DimensionComparisonRow[];
  byCollege: DimensionComparisonRow[];
  byCourse: DimensionComparisonRow[];
  byCounsellor: DimensionComparisonRow[];
}) {
  const currentLabel = formatDateRangeLabel(periodA);
  const comparisonLabel = formatDateRangeLabel(periodB);

  const summaryHeaders = [
    "Metric",
    currentLabel,
    comparisonLabel,
    "Change %",
  ];

  const summaryRows: SheetData = [
    summaryHeaders,
    ...[
      ["Leads created", periodAMetrics.leadsCreated, periodBMetrics.leadsCreated],
      [
        "Counselling completed",
        periodAMetrics.counsellingCompleted,
        periodBMetrics.counsellingCompleted,
      ],
      [
        "Cohort registrations",
        periodAMetrics.cohortRegistrations,
        periodBMetrics.cohortRegistrations,
      ],
      [
        "Conversion rate (%)",
        Number(periodAMetrics.conversionRate.toFixed(1)),
        Number(periodBMetrics.conversionRate.toFixed(1)),
      ],
      [
        "Registrations (by reg. date)",
        periodAMetrics.registrationsTotal,
        periodBMetrics.registrationsTotal,
      ],
      [
        "Registrations unpaid",
        periodAMetrics.registrationsUnpaid,
        periodBMetrics.registrationsUnpaid,
      ],
      [
        "Registrations paid",
        periodAMetrics.registrationsPaid,
        periodBMetrics.registrationsPaid,
      ],
    ].map(([metric, a, b]) => [
      metric,
      a,
      b,
      formatPct(percentChange(Number(a), Number(b))),
    ]),
  ];

  const dimensionHeaders = [
    "Group",
    `Leads (${formatDateRangeCompact(periodA)})`,
    `Leads (${formatDateRangeCompact(periodB)})`,
    "Δ Leads %",
    `Counselling (${formatDateRangeCompact(periodA)})`,
    `Counselling (${formatDateRangeCompact(periodB)})`,
    `Regs (${formatDateRangeCompact(periodA)})`,
    `Regs (${formatDateRangeCompact(periodB)})`,
    `Unpaid (${formatDateRangeCompact(periodA)})`,
    `Unpaid (${formatDateRangeCompact(periodB)})`,
    `Paid (${formatDateRangeCompact(periodA)})`,
    `Paid (${formatDateRangeCompact(periodB)})`,
    `Conversion ${formatDateRangeCompact(periodA)} %`,
    `Conversion ${formatDateRangeCompact(periodB)} %`,
    "Δ Conversion %",
  ];

  const toDimensionSheet = (
    rows: DimensionComparisonRow[],
    labelFn: (row: DimensionComparisonRow) => string,
  ): SheetData => [
    dimensionHeaders,
    ...rows.map((row) => [
      labelFn(row),
      row.periodA.leadsCreated,
      row.periodB.leadsCreated,
      formatPct(percentChange(row.periodA.leadsCreated, row.periodB.leadsCreated)),
      row.periodA.counsellingCompleted,
      row.periodB.counsellingCompleted,
      row.periodA.registrationsTotal,
      row.periodB.registrationsTotal,
      row.periodA.registrationsUnpaid,
      row.periodB.registrationsUnpaid,
      row.periodA.registrationsPaid,
      row.periodB.registrationsPaid,
      Number(row.periodA.conversionRate.toFixed(1)),
      Number(row.periodB.conversionRate.toFixed(1)),
      formatPct(
        percentChange(row.periodA.conversionRate, row.periodB.conversionRate),
      ),
    ]),
  ];

  await writeXlsxFile([
    {
      sheet: "Summary",
      data: summaryRows,
      columns: summaryHeaders.map((header) => ({
        width: Math.max(header.length + 2, 16),
      })),
    },
    {
      sheet: "By Source",
      data: toDimensionSheet(
        bySource,
        (row) => LEAD_SOURCE_LABELS[row.id as LeadSource] ?? row.name,
      ),
      columns: dimensionHeaders.map((header) => ({
        width: Math.max(header.length + 2, 12),
      })),
    },
    {
      sheet: "By College",
      data: toDimensionSheet(byCollege, (row) => row.name),
      columns: dimensionHeaders.map((header) => ({
        width: Math.max(header.length + 2, 12),
      })),
    },
    {
      sheet: "By Course",
      data: toDimensionSheet(byCourse, (row) => row.name),
      columns: dimensionHeaders.map((header) => ({
        width: Math.max(header.length + 2, 12),
      })),
    },
    {
      sheet: "By Counsellor",
      data: toDimensionSheet(byCounsellor, (row) => row.name),
      columns: dimensionHeaders.map((header) => ({
        width: Math.max(header.length + 2, 12),
      })),
    },
  ]).toFile(
    `Comparison_Report_${periodA.from}_${periodA.to}_vs_${periodB.from}_${periodB.to}.xlsx`,
  );
}

export function ComparisonReportsClient() {
  const initial = React.useMemo(() => getPresetComparison("mom"), []);
  const [periodA, setPeriodA] = React.useState<DateRange>(initial.periodA);
  const [periodB, setPeriodB] = React.useState<DateRange>(initial.periodB);
  const [periodMode, setPeriodMode] = React.useState<PeriodMode>("auto");
  const [activePreset, setActivePreset] = React.useState<ComparisonPreset | null>(
    "mom",
  );
  const [collegeIds, setCollegeIds] = React.useState<string[]>([]);
  const [courses, setCourses] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState<LeadSource[]>([]);
  const [counsellorIds, setCounsellorIds] = React.useState<string[]>([]);
  const [exporting, setExporting] = React.useState(false);
  const [appliedFilters, setAppliedFilters] = React.useState(() => ({
    periodA: initial.periodA,
    periodB: initial.periodB,
    periodMode: "auto" as PeriodMode,
    activePreset: "mom" as ComparisonPreset | null,
    collegeIds: [] as string[],
    courses: [] as string[],
    sources: [] as LeadSource[],
    counsellorIds: [] as string[],
  }));

  const rangesValid =
    isValidDateRange(periodA) && isValidDateRange(periodB);
  const appliedRangesValid =
    isValidDateRange(appliedFilters.periodA) &&
    isValidDateRange(appliedFilters.periodB);

  const report = useComparisonReport({
    periodA: appliedFilters.periodA,
    periodB: appliedFilters.periodB,
    collegeIds:
      appliedFilters.collegeIds.length > 0
        ? appliedFilters.collegeIds
        : undefined,
    courses: appliedFilters.courses.length > 0 ? appliedFilters.courses : undefined,
    sources: appliedFilters.sources.length > 0 ? appliedFilters.sources : undefined,
    counsellorIds:
      appliedFilters.counsellorIds.length > 0
        ? appliedFilters.counsellorIds
        : undefined,
  });

  const collegeOptions = React.useMemo(
    () => report.data?.colleges ?? [],
    [report.data?.colleges],
  );
  const selectedColleges = collegeOptions.filter((college) =>
    collegeIds.includes(college.id),
  );

  const courseOptions = React.useMemo(() => {
    const collegesForCourses =
      selectedColleges.length > 0 ? selectedColleges : collegeOptions;
    const set = new Set<string>();
    for (const college of collegesForCourses) {
      for (const item of college.courses ?? []) {
        const normalized = item.trim();
        if (normalized) set.add(normalized);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [collegeOptions, selectedColleges]);

  React.useEffect(() => {
    if (courses.length === 0) return;
    const validCourses = new Set(courseOptions);
    const nextCourses = courses.filter((course) => validCourses.has(course));
    if (nextCourses.length !== courses.length) {
      setCourses(nextCourses);
    }
  }, [courseOptions, courses]);

  const counsellorOptions = (report.data?.profiles ?? []).filter((profile) =>
    ["counsellor", "admission_manager", "management", "super_admin"].includes(
      profile.role,
    ),
  );

  const sourceOptions = React.useMemo(
    () => Object.keys(LEAD_SOURCE_LABELS) as LeadSource[],
    [],
  );

  const applyPreset = (preset: ComparisonPreset) => {
    const next = getPresetComparison(preset);
    setActivePreset(preset);
    setPeriodMode("auto");
    setPeriodA(next.periodA);
    setPeriodB(next.periodB);
  };

  const updatePeriodA = (next: DateRange) => {
    setActivePreset(null);
    setPeriodA(next);
    if (periodMode === "auto" && isValidDateRange(next)) {
      setPeriodB(previousEqualPeriod(next));
    }
  };

  const updatePeriodB = (next: DateRange) => {
    setActivePreset(null);
    setPeriodMode("custom");
    setPeriodB(next);
  };

  const setMode = (mode: PeriodMode) => {
    setPeriodMode(mode);
    setActivePreset(null);
    if (mode === "auto" && isValidDateRange(periodA)) {
      setPeriodB(previousEqualPeriod(periodA));
    }
  };

  const draftPeriodALabel = formatDateRangeLabel(periodA);
  const draftPeriodBLabel = formatDateRangeLabel(periodB);
  const periodALabel = formatDateRangeLabel(appliedFilters.periodA);
  const periodBLabel = formatDateRangeLabel(appliedFilters.periodB);
  const periodACompact = formatDateRangeCompact(appliedFilters.periodA);
  const periodBCompact = formatDateRangeCompact(appliedFilters.periodB);
  const chartConfig = React.useMemo(
    () => buildChartConfig(periodALabel, periodBLabel),
    [periodALabel, periodBLabel],
  );

  const filterSummary = React.useMemo(() => {
    const collegeLabels =
      appliedFilters.collegeIds.length > 0
        ? collegeOptions
            .filter((college) =>
              appliedFilters.collegeIds.includes(college.id),
            )
            .map((college) => college.name)
        : [];
    const counsellorLabels =
      appliedFilters.counsellorIds.length > 0
        ? counsellorOptions
            .filter((profile) =>
              appliedFilters.counsellorIds.includes(profile.id),
            )
            .map((profile) => profile.full_name || profile.email)
        : [];

    return joinFilterParts([
      `Current: ${periodALabel}`,
      `Comparison: ${periodBLabel}`,
      appliedFilters.periodMode === "auto"
        ? "Mode: Auto previous period"
        : "Mode: Custom",
      appliedFilters.activePreset
        ? `Preset: ${COMPARISON_PRESET_LABELS[appliedFilters.activePreset]}`
        : null,
      collegeLabels.length > 0 ? `Colleges: ${collegeLabels.join(", ")}` : null,
      appliedFilters.courses.length > 0
        ? `Courses: ${appliedFilters.courses.join(", ")}`
        : null,
      appliedFilters.sources.length > 0
        ? `Sources: ${appliedFilters.sources
            .map((item) => LEAD_SOURCE_LABELS[item])
            .join(", ")}`
        : null,
      counsellorLabels.length > 0
        ? `Counsellors: ${counsellorLabels.join(", ")}`
        : null,
    ]);
  }, [
    appliedFilters,
    collegeOptions,
    counsellorOptions,
    periodALabel,
    periodBLabel,
  ]);

  const periodAMetrics = report.data?.periodA;
  const periodBMetrics = report.data?.periodB;

  const kpiChartData = React.useMemo(() => {
    if (!periodAMetrics || !periodBMetrics) return [];
    return buildKpiChartData(periodAMetrics, periodBMetrics);
  }, [periodAMetrics, periodBMetrics]);

  const sourceChartData = React.useMemo(
    () => buildSourceChartData(report.data?.bySource ?? []),
    [report.data?.bySource],
  );

  const handleExcelExport = async () => {
    if (!report.data || !periodAMetrics || !periodBMetrics) return;
    setExporting(true);
    try {
      await exportComparisonExcel({
        periodA: appliedFilters.periodA,
        periodB: appliedFilters.periodB,
        periodAMetrics,
        periodBMetrics,
        bySource: report.data.bySource,
        byCollege: report.data.byCollege,
        byCourse: report.data.byCourse,
        byCounsellor: report.data.byCounsellor,
      });
    } finally {
      setExporting(false);
    }
  };

  if (report.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (report.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparison Report</CardTitle>
          <CardDescription className="text-destructive">
            {(report.error as Error).message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ReportPrintable
      title="Comparison Report"
      documentTitle={`Comparison Report ${periodALabel} vs ${periodBLabel}`}
      filterSummary={filterSummary}
    >
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Comparison Report
          </h2>
          <p className="text-sm text-muted-foreground">
            Comparing <span className="font-medium text-foreground">{periodALabel}</span> vs{" "}
            <span className="font-medium text-foreground">{periodBLabel}</span>. Leads,
            counselling, and conversion use lead created date; paid/unpaid registrations use
            registration completed date.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!appliedRangesValid || exporting || !report.data}
          onClick={() => void handleExcelExport()}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {exporting ? "Exporting…" : "Export Excel"}
        </Button>
      </div>

      <Card className="no-print">
        <CardHeader>
          <CardTitle>Comparison Filters</CardTitle>
          <CardDescription>
            Use presets, auto previous period, or pick two custom date ranges (SGT).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={activePreset === preset ? "default" : "outline"}
                onClick={() => applyPreset(preset)}
              >
                {COMPARISON_PRESET_LABELS[preset]}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={periodMode === "auto" ? "secondary" : "outline"}
              onClick={() => setMode("auto")}
            >
              Auto previous period
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodMode === "custom" ? "secondary" : "outline"}
              onClick={() => setMode("custom")}
            >
              Custom date ranges
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Current period</p>
              <p className="text-xs text-muted-foreground">{draftPeriodALabel}</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid w-full gap-1 sm:w-auto">
                  <label className="text-xs text-muted-foreground">From</label>
                  <Input
                    type="date"
                    value={periodA.from}
                    onChange={(e) =>
                      updatePeriodA({ ...periodA, from: e.target.value })
                    }
                  />
                </div>
                <div className="grid w-full gap-1 sm:w-auto">
                  <label className="text-xs text-muted-foreground">To</label>
                  <Input
                    type="date"
                    value={periodA.to}
                    onChange={(e) =>
                      updatePeriodA({ ...periodA, to: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Comparison period</p>
              <p className="text-xs text-muted-foreground">{draftPeriodBLabel}</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid w-full gap-1 sm:w-auto">
                  <label className="text-xs text-muted-foreground">From</label>
                  <Input
                    type="date"
                    value={periodB.from}
                    disabled={periodMode === "auto"}
                    onChange={(e) =>
                      updatePeriodB({ ...periodB, from: e.target.value })
                    }
                  />
                </div>
                <div className="grid w-full gap-1 sm:w-auto">
                  <label className="text-xs text-muted-foreground">To</label>
                  <Input
                    type="date"
                    value={periodB.to}
                    disabled={periodMode === "auto"}
                    onChange={(e) =>
                      updatePeriodB({ ...periodB, to: e.target.value })
                    }
                  />
                </div>
              </div>
              {periodMode === "auto" ? (
                <p className="text-xs text-muted-foreground">
                  Auto-filled from the equal-length period before the current range.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid w-full gap-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">College</label>
              <MultiSelectFilter
                options={collegeOptions.map((college) => ({
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
              <label className="text-xs text-muted-foreground">Course</label>
              <MultiSelectFilter
                options={courseOptions.map((course) => ({
                  value: course,
                  label: course,
                }))}
                selected={courses}
                onChange={setCourses}
                placeholder="All courses"
                allLabel="All courses"
                searchPlaceholder="Search courses…"
                emptyMessage="No courses found."
              />
            </div>
            <div className="grid w-full gap-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Source</label>
              <MultiSelectFilter
                options={sourceOptions.map((source) => ({
                  value: source,
                  label: LEAD_SOURCE_LABELS[source],
                }))}
                selected={sources}
                onChange={(values) => setSources(values as LeadSource[])}
                placeholder="All sources"
                allLabel="All sources"
                searchPlaceholder="Search sources…"
                emptyMessage="No sources found."
              />
            </div>
            <div className="grid w-full gap-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Counsellor</label>
              <MultiSelectFilter
                options={counsellorOptions.map((profile) => ({
                  value: profile.id,
                  label: profile.full_name || profile.email,
                }))}
                selected={counsellorIds}
                onChange={setCounsellorIds}
                placeholder="All counsellors"
                allLabel="All counsellors"
                searchPlaceholder="Search counsellors…"
                emptyMessage="No counsellors found."
              />
            </div>
          </div>

          <Button
            type="button"
            disabled={!rangesValid}
            onClick={() =>
              setAppliedFilters({
                periodA,
                periodB,
                periodMode,
                activePreset,
                collegeIds,
                courses,
                sources,
                counsellorIds,
              })
            }
          >
            Apply filters
          </Button>

          {!rangesValid ? (
            <p className="text-sm text-destructive">
              Each period needs a valid from/to range (from ≤ to).
            </p>
          ) : null}
        </CardContent>
      </Card>

      {periodAMetrics && periodBMetrics ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
              <div>
                <p className="text-xs text-muted-foreground">Current period</p>
                <p className="font-medium">{periodALabel}</p>
              </div>
              <p className="text-sm text-muted-foreground">vs</p>
              <div>
                <p className="text-xs text-muted-foreground">Comparison period</p>
                <p className="font-medium">{periodBLabel}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ComparisonMetricCard
              label="Leads created"
              periodA={periodAMetrics.leadsCreated}
              periodB={periodBMetrics.leadsCreated}
              periodALabel={periodALabel}
              periodBLabel={periodBLabel}
              icon={<UsersRound className="h-4 w-4 text-muted-foreground" />}
              hint="By lead created date"
            />
            <ComparisonMetricCard
              label="Counselling completed"
              periodA={periodAMetrics.counsellingCompleted}
              periodB={periodBMetrics.counsellingCompleted}
              periodALabel={periodALabel}
              periodBLabel={periodBLabel}
              icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
              hint="Among leads created in each period"
            />
            <ComparisonMetricCard
              label="Conversion rate"
              periodA={periodAMetrics.conversionRate}
              periodB={periodBMetrics.conversionRate}
              periodALabel={periodALabel}
              periodBLabel={periodBLabel}
              format="percent"
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              hint="Cohort: registrations ÷ leads created"
            />
            <ComparisonMetricCard
              label="Registrations (total)"
              periodA={periodAMetrics.registrationsTotal}
              periodB={periodBMetrics.registrationsTotal}
              periodALabel={periodALabel}
              periodBLabel={periodBLabel}
              icon={<GraduationCap className="h-4 w-4 text-muted-foreground" />}
              hint="By registration completed date"
            />
            <ComparisonMetricCard
              label="Registrations unpaid"
              periodA={periodAMetrics.registrationsUnpaid}
              periodB={periodBMetrics.registrationsUnpaid}
              periodALabel={periodALabel}
              periodBLabel={periodBLabel}
              icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
            />
            <ComparisonMetricCard
              label="Registrations paid"
              periodA={periodAMetrics.registrationsPaid}
              periodB={periodBMetrics.registrationsPaid}
              periodALabel={periodALabel}
              periodBLabel={periodBLabel}
              icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>KPI comparison</CardTitle>
                <CardDescription>
                  {periodALabel} vs {periodBLabel}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {kpiChartData.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                    No data for selected periods
                  </div>
                ) : (
                  <ChartContainer
                    config={chartConfig}
                    className="h-[280px] w-full"
                  >
                    <BarChart data={kpiChartData} margin={{ top: 16 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="metric" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        dataKey="periodA"
                        fill="var(--color-periodA)"
                        radius={[4, 4, 0, 0]}
                      >
                        <LabelList dataKey="periodA" position="top" formatter={chartCountLabel} />
                      </Bar>
                      <Bar
                        dataKey="periodB"
                        fill="var(--color-periodB)"
                        radius={[4, 4, 0, 0]}
                      >
                        <LabelList dataKey="periodB" position="top" formatter={chartCountLabel} />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Leads by source</CardTitle>
                <CardDescription>
                  Top sources by lead volume in {periodALabel}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sourceChartData.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                    No source data for selected periods
                  </div>
                ) : (
                  <ChartContainer
                    config={chartConfig}
                    className="h-[280px] w-full"
                  >
                    <BarChart data={sourceChartData} margin={{ top: 16 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="source"
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                        tickFormatter={(value: string) =>
                          value.length > 12 ? `${value.slice(0, 12)}…` : value
                        }
                      />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        dataKey="periodA"
                        fill="var(--color-periodA)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="periodB"
                        fill="var(--color-periodB)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By source</CardTitle>
              <CardDescription>
                Leads (created date) and registrations (registration date)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DimensionComparisonTable
                labelColumn="Source"
                rows={report.data?.bySource ?? []}
                emptyMessage="No source rows for the selected filters."
                sourceLabels
                periodALabel={periodACompact}
                periodBLabel={periodBCompact}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By college</CardTitle>
            </CardHeader>
            <CardContent>
              <DimensionComparisonTable
                labelColumn="College"
                rows={report.data?.byCollege ?? []}
                emptyMessage="No college rows for the selected filters."
                periodALabel={periodACompact}
                periodBLabel={periodBCompact}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By course</CardTitle>
            </CardHeader>
            <CardContent>
              <DimensionComparisonTable
                labelColumn="Course"
                rows={report.data?.byCourse ?? []}
                emptyMessage="No course rows for the selected filters."
                periodALabel={periodACompact}
                periodBLabel={periodBCompact}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By counsellor</CardTitle>
            </CardHeader>
            <CardContent>
              <DimensionComparisonTable
                labelColumn="Counsellor"
                rows={report.data?.byCounsellor ?? []}
                emptyMessage="No counsellor rows for the selected filters."
                periodALabel={periodACompact}
                periodBLabel={periodBCompact}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </ReportPrintable>
  );
}
