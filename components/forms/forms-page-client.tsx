"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  XAxis,
  YAxis,
} from "recharts";
import {
  Download,
  FileSpreadsheet,
  BarChart3,
  TableIcon,
  Star,
  ArrowUpDown,
} from "lucide-react";
import writeXlsxFile, {
  type Sheet,
  type SheetData,
} from "write-excel-file/browser";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  useForms,
  useFormFields,
  useFormSubmissions,
  type FormField,
  type FormSubmission,
} from "@/lib/hooks/use-forms";

const RATING_COLORS = [
  "hsl(var(--chart-5))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-1))",
];

// ─── helpers ────────────────────────────────────────────────────────────────

function avgRating(submissions: FormSubmission[], fieldKey: string): number {
  const vals = submissions
    .map((s) => Number(s.values_json?.[fieldKey]))
    .filter((v) => !isNaN(v) && v > 0);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function ratingDistribution(submissions: FormSubmission[], fieldKey: string) {
  const dist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  submissions.forEach((s) => {
    const v = String(s.values_json?.[fieldKey]);
    if (v in dist) dist[v]++;
  });
  return [1, 2, 3, 4, 5].map((r) => ({ rating: String(r), count: dist[String(r)] }));
}

function groupBySection(fields: FormField[]) {
  const sections: Record<string, FormField[]> = {};
  for (const f of fields) {
    if (f.field_type !== "rating") continue;
    const parts = f.field_key.split("_");
    const section = parts[0] ?? "general";
    if (!sections[section]) sections[section] = [];
    sections[section].push(f);
  }
  return sections;
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= full
              ? "h-3 w-3 fill-amber-400 text-amber-400"
              : "h-3 w-3 text-muted-foreground/40"
          }
        />
      ))}
      <span className="ml-1 text-xs font-medium tabular-nums">
        {value.toFixed(1)}
      </span>
    </span>
  );
}

type SortDir = "asc" | "desc";
type SortKey =
  | "submitted_at"
  | "submitter_name"
  | "submitter_email"
  | "avg_rating"
  | `field:${string}`;

function getSubmissionAvg(submission: FormSubmission, ratingFields: FormField[]) {
  if (!ratingFields.length) return 0;
  const vals = ratingFields
    .map((f) => Number(submission.values_json?.[f.field_key]))
    .filter((v) => !isNaN(v) && v > 0);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function getSortableValue(
  submission: FormSubmission,
  sortKey: SortKey,
  ratingFields: FormField[],
) {
  if (sortKey === "submitted_at") return new Date(submission.submitted_at).getTime();
  if (sortKey === "submitter_name") return (submission.submitter_name ?? "").toLowerCase();
  if (sortKey === "submitter_email") return (submission.submitter_email ?? "").toLowerCase();
  if (sortKey === "avg_rating") return getSubmissionAvg(submission, ratingFields);
  if (sortKey.startsWith("field:")) {
    const key = sortKey.slice("field:".length);
    const raw = submission.values_json?.[key];
    const n = Number(raw);
    if (raw === null || raw === undefined) return "";
    if (!isNaN(n) && raw !== "") return n;
    return String(raw).toLowerCase();
  }
  return "";
}

// ─── Excel export ────────────────────────────────────────────────────────────

function toExcelCellValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toColumns(headers: string[], minWidth = 14) {
  return headers.map((h) => ({ width: Math.max(h.length + 2, minWidth) }));
}

async function exportToExcel(
  formTitle: string,
  fields: FormField[],
  submissions: FormSubmission[],
) {
  const sheets: Sheet<Blob>[] = [];

  // ── Sheet 1: Raw submissions ─────────────────────────────────────────────
  const activeFields = [...fields].sort((a, b) => a.field_order - b.field_order);
  const headers = [
    "Submission #",
    "Submitted At",
    "Submitter Name",
    "Submitter Email",
    ...activeFields.map((f) => f.label),
  ];
  const rows: SheetData = submissions.map((s, idx) => [
    idx + 1,
    format(new Date(s.submitted_at), "yyyy-MM-dd HH:mm"),
    s.submitter_name ?? "",
    s.submitter_email ?? "",
    ...activeFields.map((f) => toExcelCellValue(s.values_json?.[f.field_key])),
  ]);
  sheets.push({
    sheet: "Submissions",
    data: [headers, ...rows],
    columns: toColumns(headers),
  });

  // ── Sheet 2: Rating averages ────────────────────────────────────────────
  const ratingFields = activeFields.filter((f) => f.field_type === "rating");
  if (ratingFields.length > 0) {
    const avgHeaders = ["Question", "Average Rating (out of 5)", "Responses"];
    const avgRows: SheetData = ratingFields.map((f) => {
      const vals = submissions
        .map((s) => Number(s.values_json?.[f.field_key]))
        .filter((v) => !isNaN(v) && v > 0);
      return [
        f.label,
        vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "-",
        vals.length,
      ];
    });
    sheets.push({
      sheet: "Rating Summary",
      data: [avgHeaders, ...avgRows],
      columns: [{ width: 60 }, { width: 28 }, { width: 12 }],
    });
  }

  // ── Sheet 3: Text responses ─────────────────────────────────────────────
  const textFields = activeFields.filter(
    (f) => f.field_type === "textarea" || f.field_type === "text",
  );
  if (textFields.length > 0) {
    const txtHeaders = ["Submitted At", "Submitter", ...textFields.map((f) => f.label)];
    const txtRows: SheetData = submissions.map((s) => [
      format(new Date(s.submitted_at), "yyyy-MM-dd HH:mm"),
      s.submitter_name ?? s.submitter_email ?? "",
      ...textFields.map((f) => toExcelCellValue(s.values_json?.[f.field_key])),
    ]);
    sheets.push({
      sheet: "Text Responses",
      data: [txtHeaders, ...txtRows],
      columns: txtHeaders.map((h, i) =>
        i >= 2 ? { width: 50 } : { width: Math.max(h.length + 2, 20) },
      ),
    });
  }

  await writeXlsxFile(sheets).toFile(
    `${formTitle.replace(/\s+/g, "_")}_submissions.xlsx`,
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FormsPageClient() {
  const {
    data: forms,
    isLoading: formsLoading,
    error: formsError,
  } = useForms();
  const [selectedFormId, setSelectedFormId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (forms && forms.length > 0 && !selectedFormId) {
      setSelectedFormId(forms[0].id);
    }
  }, [forms, selectedFormId]);

  const {
    data: fields,
    isLoading: fieldsLoading,
    error: fieldsError,
  } = useFormFields(selectedFormId);
  const {
    data: submissions,
    isLoading: subsLoading,
    error: subsError,
  } = useFormSubmissions(selectedFormId);

  const selectedForm = forms?.find((f) => f.id === selectedFormId);
  const ratingFields = (fields ?? []).filter((f) => f.field_type === "rating");
  const textFields = (fields ?? []).filter(
    (f) => f.field_type === "textarea",
  );
  const infoFields = (fields ?? []).filter(
    (f) => !["rating", "textarea"].includes(f.field_type),
  );

  const isLoading = formsLoading || fieldsLoading || subsLoading;
  const anyError = (formsError || fieldsError || subsError) as Error | null;

  const [sortKey, setSortKey] = React.useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const sortOptions = React.useMemo(() => {
    const base: Array<{ value: SortKey; label: string }> = [
      { value: "submitted_at", label: "Submitted" },
      { value: "submitter_name", label: "Name" },
      { value: "submitter_email", label: "Email" },
    ];
    if (ratingFields.length) base.push({ value: "avg_rating", label: "Avg Rating" });

    const fieldBased = (fields ?? [])
      .filter((f) => f.field_type !== "rating") // ratings already covered by avg + per-question charts
      .map((f) => ({ value: `field:${f.field_key}` as const, label: f.label }));

    return [...base, ...fieldBased];
  }, [fields, ratingFields.length]);

  const sortedSubmissions = React.useMemo(() => {
    const list = [...(submissions ?? [])];
    if (!list.length) return list;
    list.sort((a, b) => {
      const av = getSortableValue(a, sortKey, ratingFields);
      const bv = getSortableValue(b, sortKey, ratingFields);
      const dir = sortDir === "asc" ? 1 : -1;

      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [submissions, sortKey, sortDir, ratingFields]);

  // Overall avg across all rating fields
  const overallAvg = React.useMemo(() => {
    if (!ratingFields.length || !submissions?.length) return 0;
    const allVals: number[] = [];
    for (const f of ratingFields) {
      for (const s of submissions) {
        const v = Number(s.values_json?.[f.field_key]);
        if (!isNaN(v) && v > 0) allVals.push(v);
      }
    }
    return allVals.length ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;
  }, [ratingFields, submissions]);

  // Avg per rating field for bar chart
  const ratingAvgData = React.useMemo(
    () =>
      ratingFields.map((f) => ({
        label: f.label.length > 42 ? f.label.slice(0, 40) + "…" : f.label,
        fullLabel: f.label,
        avg: parseFloat(avgRating(submissions ?? [], f.field_key).toFixed(2)),
      })),
    [ratingFields, submissions],
  );

  // Radar: section averages
  const sections = React.useMemo(
    () => groupBySection(fields ?? []),
    [fields],
  );
  const radarData = React.useMemo(
    () =>
      Object.entries(sections).map(([section, sFields]) => {
        const avg =
          sFields.reduce(
            (sum, f) => sum + avgRating(submissions ?? [], f.field_key),
            0,
          ) / (sFields.length || 1);
        return {
          section: section.charAt(0).toUpperCase() + section.slice(1),
          avg: parseFloat(avg.toFixed(2)),
        };
      }),
    [sections, submissions],
  );

  // Submission count per day
  const dailyData = React.useMemo(() => {
    const map: Record<string, number> = {};
    (submissions ?? []).forEach((s) => {
      const day = format(new Date(s.submitted_at), "MMM d");
      map[day] = (map[day] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([date, count]) => ({ date, count }))
      .slice(-14);
  }, [submissions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
          <p className="text-sm text-muted-foreground">
            View and export form submissions with analysis.
          </p>
        </div>
        {selectedForm && submissions && submissions.length > 0 && fields && (
          <Button
            onClick={() => exportToExcel(selectedForm.title, fields, submissions)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
        )}
      </div>

      {/* Form selector */}
      {formsLoading ? (
        <Skeleton className="h-10 w-72" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selectedFormId ?? ""}
            onValueChange={setSelectedFormId}
          >
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select a form" />
            </SelectTrigger>
            <SelectContent>
              {(forms ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedForm && (
            <Badge variant={selectedForm.is_active ? "default" : "secondary"}>
              {selectedForm.is_active ? "Active" : "Inactive"}
            </Badge>
          )}
          {selectedForm?.description && (
            <span className="text-sm text-muted-foreground">
              {selectedForm.description}
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
          <Skeleton className="col-span-full h-72 w-full" />
        </div>
      ) : anyError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="font-medium text-destructive">Unable to load forms data</div>
          <div className="mt-1 text-muted-foreground">
            {anyError.message}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            This is usually caused by missing Supabase RLS SELECT policies for{" "}
            <span className="font-mono">form_submissions</span> /{" "}
            <span className="font-mono">form_submission_values</span>.
          </div>
        </div>
      ) : !submissions || submissions.length === 0 ? (
        <div className="flex h-52 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          <FileSpreadsheet className="mr-2 h-5 w-5" />
          No submissions for this form yet.
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="ratings">
              <Star className="mr-1.5 h-3.5 w-3.5" />
              Ratings
            </TabsTrigger>
            <TabsTrigger value="responses">
              <TableIcon className="mr-1.5 h-3.5 w-3.5" />
              All Responses
            </TabsTrigger>
          </TabsList>

          {/* ── Overview ────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4 pt-4">
            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard title="Total Submissions" value={submissions.length} />
              <KpiCard
                title="Overall Avg Rating"
                value={<Stars value={overallAvg} />}
              />
              <KpiCard title="Rating Questions" value={ratingFields.length} />
              <KpiCard
                title="Latest Submission"
                value={format(new Date(submissions[0].submitted_at), "d MMM yyyy")}
              />
            </div>

            {/* Submission trend + Radar */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Submission Volume</CardTitle>
                  <CardDescription>By date (last 14 days)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{ count: { label: "Submissions", color: "hsl(var(--chart-1))" } }}
                    className="h-[220px] w-full"
                  >
                    <BarChart data={dailyData} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {radarData.length > 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Section Averages</CardTitle>
                    <CardDescription>Average rating per section</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{ avg: { label: "Avg Rating", color: "hsl(var(--chart-2))" } }}
                      className="h-[220px] w-full"
                    >
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                        <PolarGrid />
                        <PolarAngleAxis dataKey="section" fontSize={11} />
                        <Radar
                          dataKey="avg"
                          stroke="hsl(var(--chart-2))"
                          fill="hsl(var(--chart-2))"
                          fillOpacity={0.3}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </RadarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Per-section cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(sections).map(([section, sFields]) => {
                const secAvg =
                  sFields.reduce(
                    (sum, f) => sum + avgRating(submissions, f.field_key),
                    0,
                  ) / (sFields.length || 1);
                return (
                  <Card key={section}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm capitalize">{section}</CardTitle>
                      <Stars value={secAvg} />
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {sFields.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">
                            {f.label}
                          </span>
                          <Stars value={avgRating(submissions, f.field_key)} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Ratings detail ──────────────────────────────────────────── */}
          <TabsContent value="ratings" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Average Rating per Question</CardTitle>
                <CardDescription>Sorted by form order · out of 5</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{ avg: { label: "Avg Rating", color: "hsl(var(--chart-1))" } }}
                  className="w-full"
                  style={{ height: `${Math.max(300, ratingAvgData.length * 38)}px` }}
                >
                  <BarChart
                    data={ratingAvgData}
                    layout="vertical"
                    margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" domain={[0, 5]} tickCount={6} fontSize={11} />
                    <YAxis
                      dataKey="label"
                      type="category"
                      width={260}
                      fontSize={10}
                      tickLine={false}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(val) => [`${val} / 5`, "Avg Rating"]}
                    />
                    <Bar dataKey="avg" radius={4}>
                      {ratingAvgData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={
                            _.avg >= 4
                              ? "hsl(var(--chart-1))"
                              : _.avg >= 3
                              ? "hsl(var(--chart-2))"
                              : "hsl(var(--chart-5))"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Distribution for each rating field */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ratingFields.map((f) => {
                const dist = ratingDistribution(submissions, f.field_key);
                return (
                  <Card key={f.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs leading-snug">{f.label}</CardTitle>
                      <Stars value={avgRating(submissions, f.field_key)} />
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={{ count: { label: "Responses" } }}
                        className="h-[130px] w-full"
                      >
                        <BarChart data={dist} margin={{ left: 0, right: 4 }}>
                          <XAxis dataKey="rating" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis fontSize={10} allowDecimals={false} tickLine={false} axisLine={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="count" radius={3}>
                            {dist.map((d, i) => (
                              <Cell key={i} fill={RATING_COLORS[i]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── All Responses table ─────────────────────────────────────── */}
          <TabsContent value="responses" className="pt-4">
            <Card className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">All Submissions</CardTitle>
                  <CardDescription>
                    {submissions.length} response{submissions.length !== 1 ? "s" : ""}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={sortKey}
                    onValueChange={(v) => setSortKey(v as SortKey)}
                  >
                    <SelectTrigger className="h-8 w-[220px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    aria-label="Toggle sort direction"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                  {fields && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        exportToExcel(selectedForm!.title, fields, sortedSubmissions)
                      }
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Excel
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="w-full max-w-full overflow-x-auto">
                  <div className="max-h-[70vh] overflow-y-auto">
                    <div className="min-w-max">
                      <Table className="w-full">
                  <TableHeader>
                    <TableRow className="[&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:bg-background">
                      <TableHead className="sticky left-0 z-30 w-12 bg-background">
                        #
                      </TableHead>
                      <TableHead className="sticky left-12 z-30 min-w-[140px] bg-background">
                        Submitted
                      </TableHead>
                      <TableHead className="sticky left-[196px] z-30 min-w-[160px] bg-background">
                        Name
                      </TableHead>
                      <TableHead className="sticky left-[356px] z-30 min-w-[200px] bg-background">
                        Email
                      </TableHead>
                      {infoFields.map((f) => (
                        <TableHead key={f.id} className="min-w-[220px] whitespace-normal">
                          {f.label}
                        </TableHead>
                      ))}
                      {ratingFields.length > 0 && (
                        <TableHead className="min-w-[120px] text-center">Avg ★</TableHead>
                      )}
                      {textFields.map((f) => (
                        <TableHead key={f.id} className="min-w-[280px] whitespace-normal">
                          {f.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSubmissions.map((s, idx) => {
                      const personalAvg = getSubmissionAvg(s, ratingFields);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="sticky left-0 z-10 bg-background text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="sticky left-12 z-10 bg-background text-xs">
                            {format(new Date(s.submitted_at), "d MMM yy, HH:mm")}
                          </TableCell>
                          <TableCell className="sticky left-[196px] z-10 bg-background font-medium">
                            {s.submitter_name ?? "—"}
                          </TableCell>
                          <TableCell className="sticky left-[356px] z-10 bg-background text-xs text-muted-foreground">
                            {s.submitter_email ?? "—"}
                          </TableCell>
                          {infoFields.map((f) => (
                            <TableCell key={f.id} className="text-xs whitespace-normal">
                              {String(s.values_json?.[f.field_key] ?? "—")}
                            </TableCell>
                          ))}
                          {ratingFields.length > 0 && (
                            <TableCell className="text-center">
                              <Stars value={isNaN(personalAvg) ? 0 : personalAvg} />
                            </TableCell>
                          )}
                          {textFields.map((f) => (
                            <TableCell
                              key={f.id}
                              className="max-w-[360px] truncate text-xs"
                              title={String(s.values_json?.[f.field_key] ?? "")}
                            >
                              {String(s.values_json?.[f.field_key] ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
