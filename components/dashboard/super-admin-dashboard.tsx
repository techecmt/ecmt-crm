"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  GraduationCap,
  Trophy,
  Users,
  UsersRound,
} from "lucide-react";
import { formatSgtDate } from "@/lib/timezone";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CounsellorLeagueRow = {
  userId: string;
  name: string;
  leadsCreated: number;
  registrations: number;
  paidRegistrations: number;
  upcomingFollowUps: number;
  overdueFollowUps: number;
};

type Props = {
  collegesCount: number;
  activeCollegesCount: number;
  collegeCounsellorsCount: number;
  counsellorsCount: number;
  totalLeads: number;
  upcomingFollowUps: number;
  overdueFollowUps: number;
  totalRegistrations: number;
  league: CounsellorLeagueRow[];
};

const TROPHY_STYLES = [
  { label: "1st", className: "text-amber-500" },
  { label: "2nd", className: "text-slate-400" },
  { label: "3rd", className: "text-amber-700" },
  { label: "4th", className: "text-muted-foreground" },
] as const;

export function SuperAdminDashboard({
  collegesCount,
  activeCollegesCount,
  collegeCounsellorsCount,
  counsellorsCount,
  totalLeads,
  upcomingFollowUps,
  overdueFollowUps,
  totalRegistrations,
  league,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Organisation-wide overview for Super Admins.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/reports">View reports</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/leads">View leads</Link>
          </Button>
        </div>
      </div>

      {overdueFollowUps > 0 ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="text-sm font-medium text-destructive">
                {overdueFollowUps} overdue follow-up{overdueFollowUps === 1 ? "" : "s"} across
                the team
              </div>
              <p className="text-xs text-muted-foreground">
                Pending tasks past their scheduled time need attention.
              </p>
            </div>
            <Button asChild size="sm" variant="destructive">
              <Link href="/dashboard/follow-ups">Open follow-ups</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          title="Colleges"
          value={collegesCount}
          hint={`${activeCollegesCount} active`}
          icon={<Building2 className="h-4 w-4" />}
        />
        <KpiCard
          title="College counsellors"
          value={collegeCounsellorsCount}
          hint="Active counsellor role"
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          title="Counsellors"
          value={counsellorsCount}
          hint="Counsellor & admission team"
          icon={<UsersRound className="h-4 w-4" />}
        />
        <KpiCard
          title="Total leads created"
          value={totalLeads}
          hint="All leads in CRM"
          icon={<UsersRound className="h-4 w-4" />}
        />
        <KpiCard
          title="Follow-ups"
          value={upcomingFollowUps + overdueFollowUps}
          hint={`${upcomingFollowUps} upcoming · ${overdueFollowUps} overdue`}
          icon={<CalendarClock className="h-4 w-4" />}
          tone={overdueFollowUps > 0 ? "danger" : "default"}
        />
        <KpiCard
          title="Total registrations"
          value={totalRegistrations}
          hint="Paid and unpaid registrations"
          icon={<GraduationCap className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Counsellor league table</CardTitle>
            <CardDescription>
              Ranked by paid registrations, then total registrations and leads assigned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Counsellor</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Registrations</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Upcoming</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {league.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No counsellor performance data yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  league.map((row, index) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <RankBadge rank={index + 1} />
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.leadsCreated}</TableCell>
                      <TableCell className="text-right">{row.registrations}</TableCell>
                      <TableCell className="text-right">{row.paidRegistrations}</TableCell>
                      <TableCell className="text-right">{row.upcomingFollowUps}</TableCell>
                      <TableCell className="text-right">{row.overdueFollowUps}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Follow-up snapshot</CardTitle>
            <CardDescription>Pending tasks as of {formatSgtDate(new Date())}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SnapshotRow
              label="Upcoming"
              value={upcomingFollowUps}
              hint="Scheduled for future dates"
              icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
            />
            <SnapshotRow
              label="Overdue"
              value={overdueFollowUps}
              hint="Past scheduled time"
              icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              tone="danger"
            />
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/follow-ups">Manage follow-ups</Link>
            </Button>
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
  tone?: "default" | "danger";
}) {
  const toneClass = tone === "danger" ? "text-destructive" : "";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className={toneClass}>{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function SnapshotRow({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-3">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
      </div>
      <div className={`text-xl font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 4) {
    const style = TROPHY_STYLES[rank - 1];
    return (
      <Badge variant="outline" className="gap-1 font-mono text-xs">
        <Trophy className={`h-3.5 w-3.5 ${style.className}`} />
        {style.label}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="font-mono text-xs">
      #{rank}
    </Badge>
  );
}
