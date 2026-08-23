"use client";

import * as React from "react";
import Link from "next/link";
import { eachWeekOfInterval, endOfWeek, startOfWeek, subDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import {
  HelpCircle,
  MessageCircleQuestion,
  MessagesSquare,
  TrendingDown,
  UserX,
} from "lucide-react";

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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCustomerAnalysisReport,
  type CustomerAnalysisFilters,
  type CustomerMessageRow,
  type NotInterestedLeadRow,
} from "@/lib/hooks/use-customer-analysis-report";
import {
  average,
  channelLabel,
  percent,
  reasonLabel,
} from "@/lib/reports/customer-analysis";
import { formatDateRangeLabel } from "@/lib/reports/comparison-periods";
import {
  downloadExcel,
  excelFilename,
  excelSheet,
} from "@/lib/reports/excel-export";
import { differenceInSgtCalendarDays, formatSgtDateTimeExport, getSgtDateKey } from "@/lib/timezone";
import {
  LEAD_SOURCE_LABELS,
  NOT_INTERESTED_REASON_LABELS,
  type LeadSource,
  type NotInterestedReason,
} from "@/lib/types";

const REASON_CONFIG: ChartConfig = {
  count: { label: "Leads", color: "hsl(var(--chart-1))" },
};

const COURSE_TREEMAP_CONFIG: ChartConfig = {
  size: { label: "Lost leads", color: "hsl(var(--chart-1))" },
};

const COURSE_TREEMAP_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

const TREND_CONFIG: ChartConfig = {
  count: { label: "Not interested", color: "hsl(var(--chart-4))" },
};

const CHANNEL_CONFIG: ChartConfig = {
  count: { label: "Messages", color: "hsl(var(--chart-2))" },
};

const REASONS = Object.keys(NOT_INTERESTED_REASON_LABELS) as NotInterestedReason[];
const CHANNELS = ["whatsapp", "messenger", "website"] as const;
const NOT_INTERESTED_PAGE_SIZE_DEFAULT = 10;
const NOT_INTERESTED_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function truncateCourseLabel(label: string, max = 28) {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

type CourseTreemapNode = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  size?: number;
  value?: number;
  fill?: string;
};

function CourseTreemapContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
  name = "",
  size,
  value,
  fill,
}: CourseTreemapNode) {
  if (!name || width <= 0 || height <= 0) return null;

  const count = size ?? value ?? 0;
  const color = fill ?? COURSE_TREEMAP_COLORS[index % COURSE_TREEMAP_COLORS.length];
  const showLabel = width > 72 && height > 40;
  const labelMax = Math.max(12, Math.floor(width / 6.5));

  return (
    <g>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        radius={4}
        fill={color}
        stroke="hsl(var(--background))"
        strokeWidth={2}
      />
      {showLabel ? (
        <>
          <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={500}>
            {truncateCourseLabel(name, labelMax)}
          </text>
          <text x={x + 8} y={y + 34} fill="rgba(255,255,255,0.88)" fontSize={10}>
            {count} lost
          </text>
        </>
      ) : null}
    </g>
  );
}

function chartCountLabel(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return "";
  return String(count);
}

function formatSgtDateTime(input: string) {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(input));
}

function formatSgtDateCompact(input: string) {
  const date = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(new Date(input));
  const time = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(input));
  return { date, time };
}

function formatSgtShortDay(input: Date | string) {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    month: "short",
    day: "numeric",
  }).format(date);
}

function toUserName(user: { full_name: string | null; email: string } | null | undefined) {
  if (!user) return "Unassigned";
  return user.full_name || user.email;
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

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function buildReasonBreakdown(
  leads: Array<{ not_interested_reason: NotInterestedReason | null }>,
) {
  const map = new Map<string, number>();
  for (const lead of leads) {
    const key = reasonLabel(lead.not_interested_reason);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function buildCourseReasonBreakdown(
  leads: Array<{
    interested_course: string | null;
    not_interested_reason: NotInterestedReason | null;
  }>,
) {
  const map = new Map<string, number>();
  for (const lead of leads) {
    const course = (lead.interested_course ?? "").trim() || "Unspecified";
    map.set(course, (map.get(course) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([course, count]) => ({ course, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildTrendData(
  leads: Array<{ updated_at: string }>,
  fromDate: string,
  toDate: string,
) {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const weeks = eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 });
  const buckets = weeks.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    return {
      key: getSgtDateKey(weekStart),
      label: `${formatSgtShortDay(weekStart)}–${formatSgtShortDay(weekEnd)}`,
      count: 0,
    };
  });

  for (const lead of leads) {
    const updated = new Date(lead.updated_at);
    const weekStart = startOfWeek(updated, { weekStartsOn: 1 });
    const key = getSgtDateKey(weekStart);
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) bucket.count += 1;
  }

  return buckets.map(({ label, count }) => ({ label, count }));
}

function buildChannelBreakdown(
  messages: Array<{ channel: "whatsapp" | "messenger" | "website" }>,
) {
  const map = new Map<string, number>();
  for (const message of messages) {
    const label = channelLabel(message.channel);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);
}

async function exportCustomerAnalysisExcel({
  fromDate,
  toDate,
  filterSummary,
  notInterestedLeads,
  totalLeadsInPeriod,
  topReason,
  avgDaysToDrop,
  reasonBreakdown,
  trendData,
  messages,
  likelyQuestionCount,
  channelBreakdown,
  messagesTruncated,
}: {
  fromDate: string;
  toDate: string;
  filterSummary: string;
  notInterestedLeads: NotInterestedLeadRow[];
  totalLeadsInPeriod: number;
  topReason: string;
  avgDaysToDrop: number | null;
  reasonBreakdown: Array<{ reason: string; count: number }>;
  trendData: Array<{ label: string; count: number }>;
  messages: CustomerMessageRow[];
  likelyQuestionCount: number;
  channelBreakdown: Array<{ channel: string; count: number }>;
  messagesTruncated: boolean;
}) {
  const share =
    totalLeadsInPeriod === 0
      ? 0
      : Number(((notInterestedLeads.length / totalLeadsInPeriod) * 100).toFixed(1));
  const courseCounts = new Map<string, number>();
  for (const lead of notInterestedLeads) {
    const course = (lead.interested_course ?? "").trim() || "Unspecified";
    courseCounts.set(course, (courseCounts.get(course) ?? 0) + 1);
  }
  const courseRows = Array.from(courseCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([course, count]) => [course, count]);

  await downloadExcel(
    excelFilename(["Customer_Analysis", fromDate, "to", toDate]),
    [
      excelSheet("Summary", ["Metric", "Value"], [
        ["Period from", fromDate],
        ["Period to", toDate],
        ["Filters", filterSummary],
        ["Not interested leads", notInterestedLeads.length],
        ["Leads created in period", totalLeadsInPeriod],
        ["Share of all leads %", share],
        ["Top reason", topReason],
        ["Avg days to drop", avgDaysToDrop === null ? "" : Number(avgDaysToDrop.toFixed(1))],
        ["Customer messages", messages.length],
        ["Likely questions", likelyQuestionCount],
        ["Messages truncated", messagesTruncated ? "Yes" : "No"],
      ]),
      excelSheet(
        "Reasons",
        ["Reason", "Leads"],
        reasonBreakdown.map((row) => [row.reason, row.count]),
      ),
      excelSheet(
        "Courses",
        ["Course", "Lost leads"],
        courseRows,
      ),
      excelSheet(
        "Trend",
        ["Week", "Not interested"],
        trendData.map((row) => [row.label, row.count]),
      ),
      excelSheet(
        "Not interested leads",
        [
          "Name",
          "Course",
          "College",
          "Source",
          "Reason",
          "Notes",
          "Counsellor",
          "Created at",
          "Marked at",
        ],
        notInterestedLeads.map((lead) => [
          lead.full_name,
          lead.interested_course ?? "",
          lead.college?.name ?? "",
          LEAD_SOURCE_LABELS[lead.source] ?? lead.source,
          reasonLabel(lead.not_interested_reason),
          lead.not_interested_notes ?? "",
          toUserName(lead.counsellor),
          formatSgtDateTimeExport(lead.created_at),
          formatSgtDateTimeExport(lead.updated_at),
        ]),
        { minWidth: 16 },
      ),
      excelSheet(
        "Channels",
        ["Channel", "Messages"],
        channelBreakdown.map((row) => [row.channel, row.count]),
      ),
      excelSheet(
        "Messages",
        ["Date", "Customer", "Channel", "Likely question", "Message", "Lead", "Course"],
        messages.map((message) => [
          formatSgtDateTimeExport(message.created_at),
          message.customer_name ?? "",
          channelLabel(message.channel),
          message.isLikelyQuestion ? "Yes" : "No",
          message.content,
          message.lead_name ?? "",
          message.interested_course ?? "",
        ]),
        { minWidth: 18 },
      ),
    ],
  );
}

export function CustomerAnalysisReportsClient() {
  const now = React.useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = React.useState(getSgtDateKey(subDays(now, 29)));
  const [toDate, setToDate] = React.useState(getSgtDateKey(now));
  const [collegeIds, setCollegeIds] = React.useState<string[]>([]);
  const [courses, setCourses] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState<LeadSource[]>([]);
  const [counsellorIds, setCounsellorIds] = React.useState<string[]>([]);
  const [reasons, setReasons] = React.useState<NotInterestedReason[]>([]);
  const [channels, setChannels] = React.useState<Array<(typeof CHANNELS)[number]>>([]);
  const [likelyQuestionsOnly, setLikelyQuestionsOnly] = React.useState(true);
  const [notInterestedPage, setNotInterestedPage] = React.useState(1);
  const [notInterestedPageSize, setNotInterestedPageSize] = React.useState(
    NOT_INTERESTED_PAGE_SIZE_DEFAULT,
  );
  const [appliedFilters, setAppliedFilters] = React.useState<CustomerAnalysisFilters>(() => ({
    fromDate: getSgtDateKey(subDays(now, 29)),
    toDate: getSgtDateKey(now),
    collegeIds: [],
    courses: [],
    sources: [],
    counsellorIds: [],
    reasons: [],
    channels: [],
    likelyQuestionsOnly: true,
  }));

  const report = useCustomerAnalysisReport({
    fromDate: appliedFilters.fromDate,
    toDate: appliedFilters.toDate,
    collegeIds: appliedFilters.collegeIds?.length ? appliedFilters.collegeIds : undefined,
    courses: appliedFilters.courses?.length ? appliedFilters.courses : undefined,
    sources: appliedFilters.sources?.length ? appliedFilters.sources : undefined,
    counsellorIds: appliedFilters.counsellorIds?.length ? appliedFilters.counsellorIds : undefined,
    reasons: appliedFilters.reasons?.length ? appliedFilters.reasons : undefined,
    channels: appliedFilters.channels?.length ? appliedFilters.channels : undefined,
    likelyQuestionsOnly: appliedFilters.likelyQuestionsOnly,
  });

  const notInterestedLeads = report.data?.notInterestedLeads ?? [];
  const notInterestedTotalPages = React.useMemo(
    () => Math.max(1, Math.ceil(notInterestedLeads.length / notInterestedPageSize)),
    [notInterestedLeads.length, notInterestedPageSize],
  );
  const paginatedNotInterestedLeads = React.useMemo(() => {
    const start = (notInterestedPage - 1) * notInterestedPageSize;
    return notInterestedLeads.slice(start, start + notInterestedPageSize);
  }, [notInterestedLeads, notInterestedPage, notInterestedPageSize]);

  React.useEffect(() => {
    setNotInterestedPage(1);
  }, [appliedFilters, notInterestedLeads.length]);

  React.useEffect(() => {
    if (notInterestedPage > notInterestedTotalPages) {
      setNotInterestedPage(notInterestedTotalPages);
    }
  }, [notInterestedPage, notInterestedTotalPages]);

  const messages = report.data?.messages ?? [];
  const collegeOptions = report.data?.colleges ?? [];
  const counsellorOptions = (report.data?.profiles ?? []).filter((profile) =>
    ["counsellor", "admission_manager", "management", "super_admin"].includes(profile.role),
  );

  const selectedColleges = collegeOptions.filter((college) => collegeIds.includes(college.id));
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

  const reasonBreakdown = React.useMemo(
    () => buildReasonBreakdown(notInterestedLeads),
    [notInterestedLeads],
  );
  const courseBreakdown = React.useMemo(
    () => buildCourseReasonBreakdown(notInterestedLeads),
    [notInterestedLeads],
  );
  const courseTreemapData = React.useMemo(
    () =>
      courseBreakdown.map((item, index) => ({
        name: item.course,
        size: item.count,
        fill: COURSE_TREEMAP_COLORS[index % COURSE_TREEMAP_COLORS.length],
      })),
    [courseBreakdown],
  );
  const trendData = React.useMemo(
    () => buildTrendData(notInterestedLeads, appliedFilters.fromDate, appliedFilters.toDate),
    [appliedFilters.fromDate, appliedFilters.toDate, notInterestedLeads],
  );
  const channelBreakdown = React.useMemo(() => buildChannelBreakdown(messages), [messages]);

  const totalLeadsInPeriod = report.data?.totalLeadsInPeriod ?? 0;
  const topReason = reasonBreakdown[0];
  const daysToDrop = React.useMemo(
    () =>
      notInterestedLeads.map((lead) =>
        Math.max(differenceInSgtCalendarDays(lead.updated_at, lead.created_at), 0),
      ),
    [notInterestedLeads],
  );
  const likelyQuestionCount = messages.filter((message) => message.isLikelyQuestion).length;

  const filterSummary = joinFilterParts([
    formatDateRangeLabel({ from: appliedFilters.fromDate, to: appliedFilters.toDate }),
    appliedFilters.collegeIds?.length
      ? `${appliedFilters.collegeIds.length} college(s)`
      : "All colleges",
    appliedFilters.courses?.length ? `${appliedFilters.courses.length} course(s)` : "All courses",
    appliedFilters.sources?.length ? `${appliedFilters.sources.length} source(s)` : "All sources",
    appliedFilters.likelyQuestionsOnly ? "Likely questions only" : "All customer messages",
  ]);

  const onApplyFilters = () => {
    setNotInterestedPage(1);
    setAppliedFilters({
      fromDate,
      toDate,
      collegeIds,
      courses,
      sources,
      counsellorIds,
      reasons,
      channels,
      likelyQuestionsOnly,
    });
  };

  const handleExportExcel = () =>
    exportCustomerAnalysisExcel({
      fromDate: appliedFilters.fromDate,
      toDate: appliedFilters.toDate,
      filterSummary,
      notInterestedLeads,
      totalLeadsInPeriod,
      topReason: topReason?.reason ?? "",
      avgDaysToDrop: average(daysToDrop),
      reasonBreakdown,
      trendData,
      messages,
      likelyQuestionCount,
      channelBreakdown,
      messagesTruncated: report.data?.messagesTruncated ?? false,
    });

  return (
    <ReportPrintable
      title="Customer Analysis"
      documentTitle="Customer Analysis Report"
      filterSummary={filterSummary}
      onExportExcel={handleExportExcel}
      excelDisabled={report.isLoading}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Date range applies to when leads were marked not interested and when messages were sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
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
            />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Course</label>
            <MultiSelectFilter
              options={courseOptions.map((course) => ({ value: course, label: course }))}
              selected={courses}
              onChange={setCourses}
              placeholder="All courses"
              allLabel="All courses"
              searchPlaceholder="Search courses…"
            />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Source</label>
            <MultiSelectFilter
              options={(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((source) => ({
                value: source,
                label: LEAD_SOURCE_LABELS[source],
              }))}
              selected={sources}
              onChange={(values) => setSources(values as LeadSource[])}
              placeholder="All sources"
              allLabel="All sources"
              searchPlaceholder="Search sources…"
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
            />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Not interested reason</label>
            <MultiSelectFilter
              options={REASONS.map((reason) => ({
                value: reason,
                label: NOT_INTERESTED_REASON_LABELS[reason],
              }))}
              selected={reasons}
              onChange={(values) => setReasons(values as NotInterestedReason[])}
              placeholder="All reasons"
              allLabel="All reasons"
              searchPlaceholder="Search reasons…"
            />
          </div>
          <div className="grid w-full gap-1 sm:w-auto">
            <label className="text-xs text-muted-foreground">Message channel</label>
            <MultiSelectFilter
              options={CHANNELS.map((channel) => ({
                value: channel,
                label: channelLabel(channel),
              }))}
              selected={channels}
              onChange={(values) => setChannels(values as Array<(typeof CHANNELS)[number]>)}
              placeholder="All channels"
              allLabel="All channels"
              searchPlaceholder="Search channels…"
            />
          </div>

          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:min-w-full">
            <div className="flex items-center gap-2">
              <Switch
                id="likely-questions-only"
                checked={likelyQuestionsOnly}
                onCheckedChange={setLikelyQuestionsOnly}
              />
              <Label htmlFor="likely-questions-only">Likely questions only</Label>
            </div>
            <Button type="button" onClick={onApplyFilters}>
              Apply filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {report.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="loss">
          <TabsList>
            <TabsTrigger value="loss">Loss Analysis</TabsTrigger>
            <TabsTrigger value="messages">Message Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="loss" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Not interested leads"
                value={notInterestedLeads.length}
                hint="Marked not interested in this period"
                icon={<UserX className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                label="Share of all leads"
                value={percent(notInterestedLeads.length, totalLeadsInPeriod)}
                hint={`${totalLeadsInPeriod} leads created in period`}
                icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                label="Top reason"
                value={topReason?.reason ?? "—"}
                hint={topReason ? `${topReason.count} lead(s)` : "No data in range"}
                icon={<HelpCircle className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                label="Avg days to drop"
                value={
                  average(daysToDrop) === null ? "—" : average(daysToDrop)!.toFixed(1)
                }
                hint="From inquiry to not interested"
                icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Not interested by course</CardTitle>
                <CardDescription>Top courses with lost leads.</CardDescription>
              </CardHeader>
              <CardContent>
                {courseBreakdown.length === 0 ? (
                  <EmptyChart label="No course breakdown available." />
                ) : (
                  <ChartContainer config={COURSE_TREEMAP_CONFIG} className="h-[320px] w-full">
                    <Treemap
                      data={courseTreemapData}
                      dataKey="size"
                      nameKey="name"
                      aspectRatio={4 / 3}
                      stroke="hsl(var(--background))"
                      content={<CourseTreemapContent />}
                    >
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const item = payload[0].payload as {
                            name?: string;
                            size?: number;
                          };
                          return (
                            <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-muted-foreground">
                                {item.size ?? 0} lost lead{(item.size ?? 0) === 1 ? "" : "s"}
                              </p>
                            </div>
                          );
                        }}
                      />
                    </Treemap>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weekly trend</CardTitle>
                <CardDescription>Not interested leads by week.</CardDescription>
              </CardHeader>
              <CardContent>
                {trendData.every((item) => item.count === 0) ? (
                  <EmptyChart label="No trend data in this range." />
                ) : (
                  <ChartContainer config={TREND_CONFIG} className="h-[280px] w-full">
                    <BarChart data={trendData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4}>
                        <LabelList dataKey="count" position="top" formatter={chartCountLabel} />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Not interested leads</CardTitle>
                <CardDescription>Detailed list with reason and counsellor notes.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {notInterestedLeads.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No not interested leads in this range.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 w-10 whitespace-nowrap px-2 py-1 text-[11px]">
                              #
                            </TableHead>
                            <TableHead className="h-8 whitespace-nowrap px-2 py-1 text-[11px]">
                              Lead
                            </TableHead>
                            <TableHead className="h-8 px-2 py-1 text-[11px]">Course</TableHead>
                            <TableHead className="h-8 whitespace-nowrap px-2 py-1 text-[11px]">
                              College
                            </TableHead>
                            <TableHead className="h-8 whitespace-nowrap px-2 py-1 text-[11px]">
                              Source
                            </TableHead>
                            <TableHead className="h-8 whitespace-nowrap px-2 py-1 text-[11px]">
                              Reason
                            </TableHead>
                            <TableHead className="h-8 min-w-[280px] px-2 py-1 text-[11px]">
                              Notes
                            </TableHead>
                            <TableHead className="h-8 whitespace-nowrap px-2 py-1 text-[11px]">
                              Counsellor
                            </TableHead>
                            <TableHead className="h-8 whitespace-nowrap px-2 py-1 text-[11px]">
                              Marked
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedNotInterestedLeads.map((lead, index) => {
                            const marked = formatSgtDateCompact(lead.updated_at);
                            const serialNumber =
                              (notInterestedPage - 1) * notInterestedPageSize + index + 1;
                            return (
                              <TableRow key={lead.id} className="hover:bg-muted/40">
                                <TableCell className="whitespace-nowrap px-2 py-1.5 align-top tabular-nums text-muted-foreground">
                                  {serialNumber}
                                </TableCell>
                                <TableCell className="whitespace-nowrap px-2 py-1.5 align-top font-medium">
                                  <Link
                                    href={`/dashboard/leads/${lead.id}`}
                                    className="text-primary hover:underline"
                                  >
                                    {lead.full_name}
                                  </Link>
                                </TableCell>
                                <TableCell
                                  className="max-w-[180px] px-2 py-1.5 align-top leading-snug"
                                  title={lead.interested_course ?? undefined}
                                >
                                  {lead.interested_course || "—"}
                                </TableCell>
                                <TableCell className="whitespace-nowrap px-2 py-1.5 align-top">
                                  {lead.college?.name || "—"}
                                </TableCell>
                                <TableCell className="whitespace-nowrap px-2 py-1.5 align-top">
                                  {LEAD_SOURCE_LABELS[lead.source]}
                                </TableCell>
                                <TableCell className="whitespace-nowrap px-2 py-1.5 align-top">
                                  {reasonLabel(lead.not_interested_reason)}
                                </TableCell>
                                <TableCell className="min-w-[280px] max-w-md px-2 py-1.5 align-top">
                                  {lead.not_interested_notes ? (
                                    <p className="whitespace-pre-wrap break-words leading-snug text-foreground">
                                      {lead.not_interested_notes}
                                    </p>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell className="whitespace-nowrap px-2 py-1.5 align-top">
                                  {toUserName(lead.counsellor)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap px-2 py-1.5 align-top tabular-nums text-muted-foreground">
                                  <div>{marked.date}</div>
                                  <div className="text-[10px]">{marked.time}</div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-sm">
                      <div className="text-muted-foreground">
                        Showing{" "}
                        <span className="font-medium text-foreground">
                          {(notInterestedPage - 1) * notInterestedPageSize + 1}
                        </span>
                        {" - "}
                        <span className="font-medium text-foreground">
                          {Math.min(
                            notInterestedPage * notInterestedPageSize,
                            notInterestedLeads.length,
                          )}
                        </span>
                        {" of "}
                        <span className="font-medium text-foreground">
                          {notInterestedLeads.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={String(notInterestedPageSize)}
                          onValueChange={(value) => {
                            setNotInterestedPageSize(Number(value));
                            setNotInterestedPage(1);
                          }}
                        >
                          <SelectTrigger className="h-8 w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NOT_INTERESTED_PAGE_SIZE_OPTIONS.map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size} / page
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={notInterestedPage <= 1}
                          onClick={() =>
                            setNotInterestedPage((prev) => Math.max(1, prev - 1))
                          }
                        >
                          Prev
                        </Button>
                        <span className="px-1 text-xs text-muted-foreground">
                          Page {notInterestedPage} of {notInterestedTotalPages}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={notInterestedPage >= notInterestedTotalPages}
                          onClick={() =>
                            setNotInterestedPage((prev) =>
                              Math.min(notInterestedTotalPages, prev + 1),
                            )
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Customer messages"
                value={messages.length}
                hint={
                  report.data?.messagesTruncated
                    ? "Showing latest 5,000 messages in range"
                    : "Filtered customer messages"
                }
                icon={<MessagesSquare className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                label="Likely questions"
                value={likelyQuestionCount}
                hint={
                  appliedFilters.likelyQuestionsOnly
                    ? "Question filter is active"
                    : "Includes all message types"
                }
                icon={<MessageCircleQuestion className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                label="WhatsApp"
                value={messages.filter((message) => message.channel === "whatsapp").length}
                icon={<MessagesSquare className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                label="Website + Messenger"
                value={
                  messages.filter(
                    (message) =>
                      message.channel === "website" || message.channel === "messenger",
                  ).length
                }
                icon={<MessagesSquare className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Messages by channel</CardTitle>
                <CardDescription>Where customers are asking questions.</CardDescription>
              </CardHeader>
              <CardContent>
                {channelBreakdown.length === 0 ? (
                  <EmptyChart label="No customer messages in this range." />
                ) : (
                  <ChartContainer config={CHANNEL_CONFIG} className="h-[280px] w-full">
                    <BarChart data={channelBreakdown}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="channel" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4}>
                        <LabelList dataKey="count" position="top" formatter={chartCountLabel} />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer message feed</CardTitle>
                <CardDescription>
                  Customer messages with quick access to linked leads.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No customer messages matched these filters.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Lead</TableHead>
                        <TableHead>Course</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((message) => (
                        <TableRow key={message.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatSgtDateTime(message.created_at)}
                          </TableCell>
                          <TableCell>{message.customer_name || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{channelLabel(message.channel)}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[420px]">
                            <div className="flex items-start gap-2">
                              {message.isLikelyQuestion ? (
                                <Badge variant="secondary" className="shrink-0">
                                  Question
                                </Badge>
                              ) : null}
                              <span className="line-clamp-2">{message.content}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {message.lead_id ? (
                              <Link
                                href={`/dashboard/leads/${message.lead_id}`}
                                className="text-primary hover:underline"
                              >
                                {message.lead_name || "View lead"}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>{message.interested_course || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </ReportPrintable>
  );
}
