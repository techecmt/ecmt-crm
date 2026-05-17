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
  Building2,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  Phone,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { format } from "date-fns";

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
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from "@/lib/types";

type Props = {
  leads: Lead[];
  colleges: Array<{ id: string; name: string; is_active: boolean }>;
  usersCount: number;
  upcoming: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    type: string;
    lead: { id: string; full_name: string; phone: string } | null;
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

export function DashboardOverview({ leads, colleges, usersCount, upcoming }: Props) {
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
            Overview of leads, admissions and counsellor performance.
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
          title="Active users"
          value={usersCount}
          icon={<TrendingUp className="h-4 w-4" />}
          hint="Counsellors & staff"
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
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8" />
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="divide-y">
                {upcoming.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-3">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">
                        {f.lead?.full_name ?? "Unknown lead"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(f.scheduled_at), "PPp")} · {f.type}
                      </div>
                    </div>
                    {f.lead ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        <Phone className="mr-1 h-3 w-3" />
                        {f.lead.phone}
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
}: {
  title: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
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
