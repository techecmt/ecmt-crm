"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Flame,
  GraduationCap,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { WhatsAppPhoneLink } from "@/components/phone/whatsapp-phone-link";
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
import {
  FOLLOW_UP_PRIORITY_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type FollowUpPriority,
  type FollowUpType,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type Profile,
} from "@/lib/types";

type Props = {
  leads: Lead[];
  colleges: Array<{ id: string; name: string; is_active: boolean }>;
  usersCount: number;
  profile: Profile;
  followUps: Array<{
    id: string;
    scheduled_at: string;
    due_date: string;
    due_time: string;
    status: string;
    type: FollowUpType;
    followup_type: FollowUpType;
    priority: FollowUpPriority;
    completed_at: string | null;
    remarks: string | null;
    lead: {
      id: string;
      full_name: string;
      phone: string;
      status: string;
      lead_score: number;
      assigned_counsellor: string | null;
      created_at: string;
      follow_up_date: string | null;
    } | null;
  }>;
};

const STATUS_ORDER: LeadStatus[] = [
  "inquiry_received",
  "invalid",
  "unable_to_reach",
  "no_response",
  "contacted_info_shared",
  "not_interested",
  "need_time_follow_up",
  "refer_to_management",
  "course_not_started",
  "on_discussions",
  "registered_closed",
  "registered_paid_reg_fee",
  "registered_dropped_out",
];

const TERMINAL_STATUSES = new Set<LeadStatus>([
  "invalid",
  "unable_to_reach",
  "no_response",
  "not_interested",
  "registered_closed",
  "registered_paid_reg_fee",
  "registered_dropped_out",
]);

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

const sourceColors: Record<LeadSource, string> = {
  tiktok_dm: "hsl(var(--chart-1))",
  print_media: "hsl(var(--chart-2))",
  tiktok_ads: "hsl(var(--chart-3))",
  meta_ads: "hsl(var(--chart-4))",
  refer_by_student: "hsl(var(--chart-5))",
  refer_by_assignees_friend: "hsl(var(--chart-1))",
  refer_by_agent: "hsl(var(--chart-2))",
  owwa: "hsl(var(--chart-3))",
  facebook_organic: "hsl(var(--chart-4))",
  website: "hsl(var(--chart-5))",
  direct_calls_whatsapp: "hsl(var(--chart-1))",
  walk_in: "hsl(var(--chart-2))",
};

export function DashboardOverview({ leads, colleges, usersCount, profile, followUps }: Props) {
  const totalLeads = leads.length;
  const admissions = leads.filter(
    (l) => l.status === "registered_closed" || l.status === "registered_paid_reg_fee",
  ).length;
  const conversion = totalLeads > 0 ? ((admissions / totalLeads) * 100).toFixed(1) : "0";
  const newLeadsThisMonth = leads.filter((l) => {
    const d = new Date(l.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const collegeData = colleges.map((c) => ({
    name: c.name.length > 18 ? c.name.slice(0, 16) + "…" : c.name,
    leads: leads.filter((l) => l.college_id === c.id).length,
  }));

  const sourceData = (Object.keys(LEAD_SOURCE_LABELS) as LeadSource[])
    .map((src) => ({
      key: src,
      label: LEAD_SOURCE_LABELS[src],
      value: leads.filter((l) => l.source === src).length,
      fill: sourceColors[src] ?? "hsl(var(--chart-1))",
    }))
    .filter((s) => s.value > 0);

  const statusData = STATUS_ORDER.map((s) => ({
    status: LEAD_STATUS_LABELS[s],
    count: leads.filter((l) => l.status === s).length,
  }));
  const now = new Date();
  const todayKey = format(now, "yyyy-MM-dd");
  const pendingTasks = followUps.filter((f) => f.status === "pending");
  const todaysFollowUps = pendingTasks.filter((f) => f.due_date === todayKey);
  const missedFollowUps = pendingTasks.filter((f) => new Date(f.scheduled_at) < now);
  const upcomingFollowUps = pendingTasks.filter(
    (f) => f.due_date > todayKey && new Date(f.scheduled_at) >= now,
  );
  const highPriorityTasks = pendingTasks.filter(
    (f) => f.priority === "high" || f.priority === "urgent" || (f.lead?.lead_score ?? 0) >= 80,
  );
  const pendingLeadIds = new Set(pendingTasks.map((f) => f.lead?.id ?? "").filter(Boolean));
  const activeLeads = leads.filter((lead) => !TERMINAL_STATUSES.has(lead.status));
  const leadsWithoutFollowUp = activeLeads.filter((lead) => !pendingLeadIds.has(lead.id));
  const completedByLead = new Map<string, string>();
  followUps
    .filter((f) => f.status === "completed" && f.completed_at)
    .forEach((f) => {
      if (!f.lead?.id || !f.completed_at) return;
      const current = completedByLead.get(f.lead.id);
      if (!current || new Date(f.completed_at) > new Date(current)) {
        completedByLead.set(f.lead.id, f.completed_at);
      }
    });
  const inactiveLeads = activeLeads
    .map((lead) => {
      const lastFollowUp = completedByLead.get(lead.id) ?? lead.created_at;
      return {
        lead,
        days: differenceInCalendarDays(now, new Date(lastFollowUp)),
      };
    })
    .filter((item) => item.days >= 7)
    .sort((a, b) => b.days - a.days);
  const taskFirst = profile.role === "counsellor";

  const sourceConfig: ChartConfig = sourceData.reduce<ChartConfig>(
    (acc, cur) => ({
      ...acc,
      [cur.key]: { label: cur.label, color: cur.fill },
    }),
    {},
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {taskFirst
              ? "Start with pending follow-up work before browsing leads."
              : "Overview of leads, admissions and counsellor performance."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/leads">View leads</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/leads?new=1">Add lead</Link>
          </Button>
        </div>
      </div>

      {missedFollowUps.length > 0 ? (
        <Card className="sticky top-4 z-10 border-destructive/40 bg-destructive/10 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="text-sm font-medium text-destructive">
                {missedFollowUps.length} missed follow-up
                {missedFollowUps.length === 1 ? "" : "s"} need attention
              </div>
              <p className="text-xs text-muted-foreground">
                Overdue tasks are highlighted in red throughout the dashboard.
              </p>
            </div>
            <Button asChild size="sm" variant="destructive">
              <Link href="/dashboard/follow-ups">Open task queue</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="Today's follow-ups"
          value={todaysFollowUps.length}
          icon={<ClipboardList className="h-4 w-4" />}
          hint="Due today"
        />
        <KpiCard
          title="Missed follow-ups"
          value={missedFollowUps.length}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="Overdue pending tasks"
          tone="danger"
        />
        <KpiCard
          title="Upcoming follow-ups"
          value={upcomingFollowUps.length}
          icon={<CalendarClock className="h-4 w-4" />}
          hint="Future pending tasks"
        />
        <KpiCard
          title="High priority leads"
          value={highPriorityTasks.length}
          icon={<Flame className="h-4 w-4" />}
          hint="High score or priority"
          tone="warning"
        />
        <KpiCard
          title="No follow-up"
          value={leadsWithoutFollowUp.length}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="Active leads without tasks"
          tone="danger"
        />
      </div>

      <div className={`grid gap-4 ${taskFirst ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <TaskListCard
          title={taskFirst ? "Your task queue" : "Today's follow-ups"}
          description="Task-first worklist for counsellors."
          tasks={dedupeById([...missedFollowUps, ...todaysFollowUps]).slice(0, 8)}
        />
        <TaskListCard
          title="High priority leads"
          description="Urgent tasks and high-intent leads."
          tasks={highPriorityTasks.slice(0, 8)}
        />
        {taskFirst ? <InactiveLeadCard leads={inactiveLeads.slice(0, 8)} /> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total leads"
          value={totalLeads}
          icon={<UsersRound className="h-4 w-4" />}
          hint={`${newLeadsThisMonth} this month`}
        />
        <KpiCard
          title="Admissions confirmed"
          value={admissions}
          icon={<GraduationCap className="h-4 w-4" />}
          hint={`${conversion}% conversion`}
        />
        <KpiCard
          title="Active colleges"
          value={colleges.filter((c) => c.is_active).length}
          icon={<Building2 className="h-4 w-4" />}
          hint={`${colleges.length} total`}
        />
        <KpiCard
          title="Inactive leads"
          value={inactiveLeads.length}
          icon={<TrendingUp className="h-4 w-4" />}
          hint={`${usersCount} active users`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leads by status</CardTitle>
            <CardDescription>Pipeline distribution across lead statuses.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads by source</CardTitle>
            <CardDescription>Where your leads are coming from.</CardDescription>
          </CardHeader>
          <CardContent>
            {sourceData.length === 0 ? (
              <EmptyChart label="No leads yet" />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads by college</CardTitle>
            <CardDescription>Distribution across all colleges.</CardDescription>
          </CardHeader>
          <CardContent>
            {collegeData.length === 0 ? (
              <EmptyChart label="Add a college to see data" />
            ) : (
              <ChartContainer
                config={{ leads: { label: "Leads", color: "hsl(var(--chart-2))" } }}
                className="h-[280px] w-full"
              >
                <BarChart data={collegeData} layout="vertical" margin={{ left: 4 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis dataKey="name" type="category" width={120} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="leads" radius={4} fill="hsl(var(--chart-2))" />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming follow-ups</CardTitle>
              <CardDescription>Pending tasks across your team.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/follow-ups">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingFollowUps.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8" />
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="divide-y">
                {upcomingFollowUps.slice(0, 8).map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-3">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">
                        {f.lead?.full_name ?? "Unknown lead"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(f.scheduled_at), "PPp")} ·{" "}
                        {FOLLOW_UP_TYPE_LABELS[f.followup_type]}
                      </div>
                    </div>
                    {f.lead ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        <WhatsAppPhoneLink phone={f.lead.phone} className="font-mono text-[10px]" />
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  tone = "default",
}: {
  title: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClasses = {
    default: "",
    warning: "text-amber-600",
    danger: "text-destructive",
  } as const;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon ? <span className={toneClasses[tone]}>{icon}</span> : null}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${toneClasses[tone]}`}>{value}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function TaskListCard({
  title,
  description,
  tasks,
}: {
  title: string;
  description: string;
  tasks: Props["followUps"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No pending tasks here.
          </div>
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => {
              const overdue = new Date(task.scheduled_at) < new Date();
              return (
                <li
                  key={task.id}
                  className={`py-3 ${overdue ? "rounded-md bg-destructive/5 px-2" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">
                        {task.lead?.full_name ?? "Unknown lead"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(task.scheduled_at), "PPp")} ·{" "}
                        {FOLLOW_UP_TYPE_LABELS[task.followup_type]}
                      </div>
                    </div>
                    <Badge
                      variant={
                        overdue || task.priority === "high" || task.priority === "urgent"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {overdue ? "Overdue" : FOLLOW_UP_PRIORITY_LABELS[task.priority]}
                    </Badge>
                  </div>
                  {task.lead ? (
                    <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
                      <Link href={`/dashboard/leads/${task.lead.id}`}>Open lead</Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function InactiveLeadCard({
  leads,
}: {
  leads: Array<{ lead: Lead; days: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inactive leads</CardTitle>
        <CardDescription>Days since last completed follow-up.</CardDescription>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No inactive leads.
          </div>
        ) : (
          <ul className="divide-y">
            {leads.map(({ lead, days }) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-sm font-medium">{lead.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    <WhatsAppPhoneLink phone={lead.phone} />
                  </div>
                </div>
                <Badge variant="outline">{days}d</Badge>
              </li>
            ))}
          </ul>
        )}
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
