"use client";

import * as React from "react";
import Link from "next/link";
import { format, isPast } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Phone,
  XCircle,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  useFollowUps,
  useUpdateFollowUpStatus,
  type FollowUpWithRelations,
} from "@/lib/hooks/use-follow-ups";
import { FOLLOW_UP_TYPE_LABELS } from "@/lib/types";

export function FollowUpsPageClient() {
  const { data: followUps, isLoading } = useFollowUps();
  const update = useUpdateFollowUpStatus();

  const groups = React.useMemo(() => {
    const list = followUps ?? [];
    const now = new Date();
    return {
      upcoming: list.filter(
        (f) => f.status === "pending" && new Date(f.scheduled_at) >= now,
      ),
      overdue: list.filter(
        (f) => f.status === "pending" && new Date(f.scheduled_at) < now,
      ),
      completed: list.filter((f) => f.status === "completed"),
      missed: list.filter((f) => f.status === "missed" || f.status === "cancelled"),
    };
  }, [followUps]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          Daily activities and pending tasks across your team.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Upcoming"
          value={groups.upcoming.length}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="default"
        />
        <KpiCard
          title="Overdue"
          value={groups.overdue.length}
          icon={<Clock className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          title="Completed"
          value={groups.completed.length}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          title="Missed / cancelled"
          value={groups.missed.length}
          icon={<XCircle className="h-4 w-4" />}
          tone="muted"
        />
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming
            {groups.upcoming.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {groups.upcoming.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="overdue">
            Overdue
            {groups.overdue.length > 0 ? (
              <Badge variant="destructive" className="ml-2">
                {groups.overdue.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="missed">Missed</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <FollowUpList
            isLoading={isLoading}
            items={groups.upcoming}
            empty="No upcoming follow-ups."
            onComplete={(id) =>
              update.mutate({ id, status: "completed" })
            }
            onMiss={(id) => update.mutate({ id, status: "missed" })}
          />
        </TabsContent>
        <TabsContent value="overdue">
          <FollowUpList
            isLoading={isLoading}
            items={groups.overdue}
            empty="Nothing overdue. Great job!"
            onComplete={(id) =>
              update.mutate({ id, status: "completed" })
            }
            onMiss={(id) => update.mutate({ id, status: "missed" })}
          />
        </TabsContent>
        <TabsContent value="completed">
          <FollowUpList
            isLoading={isLoading}
            items={groups.completed}
            empty="No completed follow-ups yet."
          />
        </TabsContent>
        <TabsContent value="missed">
          <FollowUpList
            isLoading={isLoading}
            items={groups.missed}
            empty="Nothing here."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FollowUpList({
  items,
  empty,
  isLoading,
  onComplete,
  onMiss,
}: {
  items: FollowUpWithRelations[];
  empty: string;
  isLoading?: boolean;
  onComplete?: (id: string) => void;
  onMiss?: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {empty}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {items.map((f) => {
          const overdue =
            f.status === "pending" && isPast(new Date(f.scheduled_at));
          return (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {f.lead?.full_name ?? "Unknown lead"}
                    <Badge variant="outline" className="text-[10px]">
                      {FOLLOW_UP_TYPE_LABELS[f.type]}
                    </Badge>
                    {overdue ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Overdue
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(f.scheduled_at), "PPp")}
                    {f.lead ? (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {f.lead.phone}
                      </span>
                    ) : null}
                  </div>
                  {f.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.notes}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onComplete ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onComplete(f.id)}
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Complete
                  </Button>
                ) : null}
                {onMiss ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onMiss(f.id)}
                  >
                    Mark missed
                  </Button>
                ) : null}
                {f.lead ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/dashboard/leads/${f.lead.id}`}>
                      Open
                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function KpiCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: "default" | "warning" | "success" | "muted";
}) {
  const toneClasses = {
    default: "",
    warning: "text-amber-600",
    success: "text-green-600",
    muted: "text-muted-foreground",
  } as const;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className={toneClasses[tone]}>{icon}</span>
      </CardHeader>
      <CardContent>
        <CardDescription>
          <span className={`text-2xl font-semibold ${toneClasses[tone]}`}>
            {value}
          </span>
        </CardDescription>
      </CardContent>
    </Card>
  );
}
