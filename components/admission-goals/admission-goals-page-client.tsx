"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Award,
  CalendarDays,
  Medal,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Users,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
import { useAdmissionGoalDashboard, useDeleteAdmissionGoal, useRecordAdmissionGoalEvent, useUpsertAdmissionGoal, type AdmissionGoalDashboardRow, type AdmissionGoalInput } from "@/lib/hooks/use-admission-goals";
import { useColleges } from "@/lib/hooks/use-colleges";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  ADMISSION_GOAL_EVENT_LABELS,
  ADMISSION_GOAL_STATUS_LABELS,
  isAdminRole,
  type AdmissionGoal,
  type AdmissionGoalEventType,
  type AdmissionGoalStatus,
  type Profile,
  type UserRole,
} from "@/lib/types";

const statusOptions: Array<AdmissionGoalStatus | "all"> = [
  "all",
  "draft",
  "active",
  "completed",
  "cancelled",
];

const funnelOrder: AdmissionGoalEventType[] = [
  "lead_qualified",
  "application_submitted",
  "admission_confirmed",
  "visa_approved",
];

const emptyGoalInput: AdmissionGoalInput = {
  title: "",
  target_count: 10,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(new Date().setMonth(new Date().getMonth() + 1))
    .toISOString()
    .slice(0, 10),
  course_name: "",
  college_id: "",
  intake: "",
  assigned_users: [],
  status: "active",
};

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "Not enough pace";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AdmissionGoalsPageClient({
  canManage,
  currentUserId,
  currentRole,
}: {
  canManage: boolean;
  currentUserId: string;
  currentRole: UserRole;
}) {
  const scopedUserId = currentRole === "counsellor" ? currentUserId : undefined;
  const [status, setStatus] = React.useState<AdmissionGoalStatus | "all">("active");
  const [collegeId, setCollegeId] = React.useState<string | "all">("all");
  const [dialogGoal, setDialogGoal] = React.useState<AdmissionGoal | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data: colleges } = useColleges();
  const { data: profiles } = useProfiles();
  const { data, isLoading } = useAdmissionGoalDashboard({
    status,
    collegeId,
    assignedUserId: scopedUserId ?? "all",
  });
  const upsertGoal = useUpsertAdmissionGoal();
  const deleteGoal = useDeleteAdmissionGoal();
  const recordEvent = useRecordAdmissionGoalEvent();

  const goals = data?.goals ?? [];
  const totalTarget = goals.reduce((sum, goal) => sum + goal.target_count, 0);
  const totalAchieved = goals.reduce((sum, goal) => sum + goal.achieved_count, 0);
  const remainingTarget = Math.max(0, totalTarget - totalAchieved);
  const teamAchievement =
    totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
  const averageExpected =
    goals.length > 0
      ? Math.round(
          goals.reduce(
            (sum, goal) => sum + goal.forecast.expectedAchievementPercent,
            0,
          ) / goals.length,
        )
      : 0;

  const funnelData = funnelOrder.map((eventType) => ({
    stage: ADMISSION_GOAL_EVENT_LABELS[eventType],
    count: data?.funnelTotals[eventType] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admission Goals</h1>
          <p className="text-sm text-muted-foreground">
            Monthly targets, forecasting, leaderboards and conversion tracking.
          </p>
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              setDialogGoal(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create goal
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid gap-3 py-4 md:grid-cols-3">
          <Select value={status} onValueChange={(value) => setStatus(value as AdmissionGoalStatus | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === "all" ? "All statuses" : ADMISSION_GOAL_STATUS_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={collegeId} onValueChange={(value) => setCollegeId(value as string | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="College" />
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
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            {currentRole === "counsellor"
              ? "Showing your assigned goals"
              : isAdminRole(currentRole)
                ? "Showing goals in your admin scope"
                : "Showing visible goals"}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Goal progress"
              value={percent(teamAchievement)}
              hint={`${totalAchieved}/${totalTarget} admissions`}
              icon={<Target className="h-4 w-4" />}
            />
            <KpiCard
              title="Remaining target"
              value={remainingTarget}
              hint="Admissions still needed"
              icon={<CalendarDays className="h-4 w-4" />}
            />
            <KpiCard
              title="Team achievement"
              value={percent(teamAchievement)}
              hint="All visible goals"
              icon={<Users className="h-4 w-4" />}
            />
            <KpiCard
              title="Expected achievement"
              value={percent(averageExpected)}
              hint="Projected final pace"
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Conversion funnel</CardTitle>
                <CardDescription>Milestones recorded against visible goals.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{ count: { label: "Leads", color: "hsl(var(--chart-1))" } }}
                  className="h-[260px] w-full"
                >
                  <BarChart data={funnelData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="stage" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <LeaderboardCard rows={data?.leaderboard ?? []} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <PerformanceChart
              title="Monthly trend"
              description="Qualified leads and admissions by goal month."
              data={data?.monthlyTrend ?? []}
              xKey="month"
              bars={["qualified", "admissions"]}
            />
            <PerformanceChart
              title="College-wise performance"
              description="Target versus achievement by college."
              data={data?.collegePerformance ?? []}
              xKey="college"
              bars={["target", "achieved"]}
            />
            <PerformanceChart
              title="Course-wise performance"
              description="Target versus achievement by course."
              data={data?.coursePerformance ?? []}
              xKey="course"
              bars={["target", "achieved"]}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {goals.length === 0 ? (
              <Card className="xl:col-span-2">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No admission goals match these filters.
                </CardContent>
              </Card>
            ) : (
              goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  canManage={canManage}
                  onEdit={() => {
                    setDialogGoal(goal);
                    setDialogOpen(true);
                  }}
                  onDelete={() => {
                    if (window.confirm(`Delete "${goal.title}"?`)) {
                      deleteGoal.mutate(goal.id);
                    }
                  }}
                  onRecordVisa={(leadId) =>
                    recordEvent.mutate({
                      goalId: goal.id,
                      leadId,
                      eventType: "visa_approved",
                    })
                  }
                />
              ))
            )}
          </div>
        </>
      )}

      <GoalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        goal={dialogGoal}
        colleges={colleges ?? []}
        profiles={(profiles ?? []).filter((profile) =>
          ["counsellor", "admission_manager", "management", "super_admin"].includes(profile.role),
        )}
        isSaving={upsertGoal.isPending}
        onSubmit={async (input) => {
          await upsertGoal.mutateAsync(input);
          setDialogOpen(false);
        }}
      />
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function LeaderboardCard({
  rows,
}: {
  rows: Array<{
    userId: string;
    name: string;
    linkedLeads: number;
    qualified: number;
    admissions: number;
    conversionRate: number;
  }>;
}) {
  const topCounsellor = rows[0];
  const bestConversion = [...rows].sort((a, b) => b.conversionRate - a.conversionRate)[0];
  const highestAdmissions = [...rows].sort((a, b) => b.admissions - a.admissions)[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
        <CardDescription>Top counsellor, conversion rate and admissions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <LeaderboardHighlight icon={<Medal className="h-4 w-4" />} label="Top counsellor" row={topCounsellor} />
          <LeaderboardHighlight icon={<TrendingUp className="h-4 w-4" />} label="Best conversion" row={bestConversion} suffix={bestConversion ? `${bestConversion.conversionRate}%` : undefined} />
          <LeaderboardHighlight icon={<Award className="h-4 w-4" />} label="Highest admissions" row={highestAdmissions} suffix={highestAdmissions ? `${highestAdmissions.admissions}` : undefined} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Counsellor</TableHead>
              <TableHead className="text-right">Admissions</TableHead>
              <TableHead className="text-right">Conv.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 5).map((row) => (
              <TableRow key={row.userId}>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-right">{row.admissions}</TableCell>
                <TableCell className="text-right">{row.conversionRate}%</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  No leaderboard data yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LeaderboardHighlight({
  icon,
  label,
  row,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  row?: { name: string; admissions: number };
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium">
        {row ? `${row.name}${suffix ? ` · ${suffix}` : ""}` : "No data"}
      </div>
    </div>
  );
}

function PerformanceChart({
  title,
  description,
  data,
  xKey,
  bars,
}: {
  title: string;
  description: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  bars: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={bars.reduce(
            (acc, key, index) => ({
              ...acc,
              [key]: {
                label: key,
                color: index === 0 ? "hsl(var(--chart-1))" : "hsl(var(--chart-2))",
              },
            }),
            {},
          )}
          className="h-[240px] w-full"
        >
          {xKey === "month" ? (
            <LineChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {bars.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={index === 0 ? "hsl(var(--chart-1))" : "hsl(var(--chart-2))"}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {bars.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={index === 0 ? "hsl(var(--chart-1))" : "hsl(var(--chart-2))"}
                  radius={4}
                />
              ))}
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function GoalCard({
  goal,
  canManage,
  onEdit,
  onDelete,
  onRecordVisa,
}: {
  goal: AdmissionGoalDashboardRow;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRecordVisa: (leadId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{goal.title}</CardTitle>
            <CardDescription>
              {goal.college?.name ?? "All colleges"} · {goal.course_name || "All courses"} ·{" "}
              {goal.intake || "Any intake"}
            </CardDescription>
          </div>
          <Badge variant={goal.status === "completed" ? "default" : "secondary"}>
            {ADMISSION_GOAL_STATUS_LABELS[goal.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>
              {goal.achieved_count}/{goal.target_count} achieved
            </span>
            <span className="font-medium">{percent(goal.progressPercent)}</span>
          </div>
          <Progress value={goal.progressPercent} />
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Metric label="Remaining" value={goal.remainingTarget} />
          <Metric label="Current pace" value={`${goal.forecast.currentPace}/day`} />
          <Metric label="Required pace" value={`${goal.forecast.requiredPace}/day`} />
          <Metric label="Expected" value={percent(goal.forecast.expectedAchievementPercent)} />
          <Metric label="Predicted completion" value={formatDate(goal.forecast.predictedCompletionDate)} />
          <Metric label="Team achievement" value={percent(goal.teamAchievementPercent)} />
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-4">
          {funnelOrder.map((eventType) => (
            <div key={eventType} className="rounded-md border bg-muted/20 p-2">
              <div className="text-muted-foreground">{ADMISSION_GOAL_EVENT_LABELS[eventType]}</div>
              <div className="text-lg font-semibold">{goal.funnel[eventType]}</div>
            </div>
          ))}
        </div>
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-medium">Linked leads</div>
          <div className="divide-y">
            {goal.linkedLeads.slice(0, 5).map((lead) => {
              const hasVisa = goal.events.some(
                (event) => event.lead_id === lead.id && event.event_type === "visa_approved",
              );
              return (
                <div key={lead.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{lead.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.counsellor?.full_name || lead.counsellor?.email || "No counsellor"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={hasVisa ? "secondary" : "outline"}
                    disabled={hasVisa}
                    onClick={() => onRecordVisa(lead.id)}
                  >
                    {hasVisa ? "Visa approved" : "Mark visa approved"}
                  </Button>
                </div>
              );
            })}
            {goal.linkedLeads.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No linked leads yet.
              </div>
            ) : null}
          </div>
        </div>
        {canManage ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function GoalDialog({
  open,
  onOpenChange,
  goal,
  colleges,
  profiles,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: AdmissionGoal | null;
  colleges: Array<{ id: string; name: string; courses: string[] }>;
  profiles: Profile[];
  isSaving: boolean;
  onSubmit: (input: AdmissionGoalInput) => Promise<void>;
}) {
  const [values, setValues] = React.useState<AdmissionGoalInput>(emptyGoalInput);

  React.useEffect(() => {
    if (!open) return;
    setValues(
      goal
        ? {
            id: goal.id,
            title: goal.title,
            target_count: goal.target_count,
            start_date: goal.start_date,
            end_date: goal.end_date,
            course_name: goal.course_name ?? "",
            college_id: goal.college_id ?? "",
            intake: goal.intake ?? "",
            assigned_users: goal.assigned_users ?? [],
            status: goal.status,
          }
        : emptyGoalInput,
    );
  }, [goal, open]);

  const selectedCollege = colleges.find((college) => college.id === values.college_id);
  const availableCourses = selectedCollege?.courses ?? [];

  const toggleUser = (userId: string, checked: boolean) => {
    setValues((prev) => ({
      ...prev,
      assigned_users: checked
        ? Array.from(new Set([...prev.assigned_users, userId]))
        : prev.assigned_users.filter((id) => id !== userId),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit admission goal" : "Create admission goal"}</DialogTitle>
          <DialogDescription>
            Goals can target a college, course, intake, counsellor or team.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              ...values,
              target_count: Number(values.target_count),
              course_name: values.course_name || null,
              college_id: values.college_id || null,
              intake: values.intake || null,
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Title</span>
              <Input
                required
                value={values.title}
                onChange={(event) => setValues((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Target count</span>
              <Input
                required
                type="number"
                min={1}
                value={values.target_count}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, target_count: Number(event.target.value) }))
                }
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Start date</span>
              <Input
                required
                type="date"
                value={values.start_date}
                onChange={(event) => setValues((prev) => ({ ...prev, start_date: event.target.value }))}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">End date</span>
              <Input
                required
                type="date"
                value={values.end_date}
                onChange={(event) => setValues((prev) => ({ ...prev, end_date: event.target.value }))}
              />
            </label>
            <div className="grid gap-2 text-sm">
              <span className="font-medium">College</span>
              <Select
                value={values.college_id || "all"}
                onValueChange={(value) =>
                  setValues((prev) => ({
                    ...prev,
                    college_id: value === "all" ? "" : value,
                    course_name: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All colleges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All colleges</SelectItem>
                  {colleges.map((college) => (
                    <SelectItem key={college.id} value={college.id}>
                      {college.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 text-sm">
              <span className="font-medium">Course</span>
              {availableCourses.length > 0 ? (
                <Select
                  value={values.course_name || "all"}
                  onValueChange={(value) =>
                    setValues((prev) => ({ ...prev, course_name: value === "all" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All courses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All courses</SelectItem>
                    {availableCourses.map((course) => (
                      <SelectItem key={course} value={course}>
                        {course}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="All courses or course name"
                  value={values.course_name ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, course_name: event.target.value }))
                  }
                />
              )}
            </div>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Intake</span>
              <Input
                placeholder="e.g. Sep 2026"
                value={values.intake ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, intake: event.target.value }))}
              />
            </label>
            <div className="grid gap-2 text-sm">
              <span className="font-medium">Status</span>
              <Select
                value={values.status}
                onValueChange={(value) =>
                  setValues((prev) => ({ ...prev, status: value as AdmissionGoalStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(statusOptions.filter((option) => option !== "all") as AdmissionGoalStatus[]).map(
                    (option) => (
                      <SelectItem key={option} value={option}>
                        {ADMISSION_GOAL_STATUS_LABELS[option]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-3 text-sm font-medium">Assigned users / team</div>
            <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
              {profiles.map((profile) => (
                <label key={profile.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={values.assigned_users.includes(profile.id)}
                    onCheckedChange={(checked) => toggleUser(profile.id, !!checked)}
                  />
                  <span>{profile.full_name || profile.email}</span>
                </label>
              ))}
              {profiles.length === 0 ? (
                <div className="text-sm text-muted-foreground">No assignable users found.</div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !values.title.trim()}>
              {isSaving ? "Saving..." : "Save goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
