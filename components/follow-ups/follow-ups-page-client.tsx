"use client";

import * as React from "react";
import Link from "next/link";
import { format, isPast } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useCompleteFollowUpTask,
  useFollowUps,
  useUpdateFollowUpStatus,
  type FollowUpWithRelations,
} from "@/lib/hooks/use-follow-ups";
import {
  FOLLOW_UP_PRIORITY_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  type FollowUpPriority,
  type FollowUpType,
  type LeadStatus,
} from "@/lib/types";

const terminalStatuses = new Set<LeadStatus>([
  "invalid",
  "unable_to_reach",
  "no_response",
  "not_interested",
  "registered_closed",
  "registered_paid_reg_fee",
  "registered_dropped_out",
]);

const followUpTypes = Object.keys(FOLLOW_UP_TYPE_LABELS) as FollowUpType[];
const priorities = Object.keys(FOLLOW_UP_PRIORITY_LABELS) as FollowUpPriority[];

export function FollowUpsPageClient() {
  const { data: followUps, isLoading } = useFollowUps();
  const update = useUpdateFollowUpStatus();
  const complete = useCompleteFollowUpTask();
  const [completingTask, setCompletingTask] =
    React.useState<FollowUpWithRelations | null>(null);

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

      {groups.overdue.length > 0 ? (
        <Card className="sticky top-4 z-10 border-destructive/40 bg-destructive/10 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="text-sm font-medium text-destructive">
                {groups.overdue.length} overdue follow-up{groups.overdue.length === 1 ? "" : "s"}
              </div>
              <p className="text-xs text-muted-foreground">
                Clear missed work first to keep counsellor queues healthy.
              </p>
            </div>
            <Button asChild size="sm" variant="destructive">
              <a href="#overdue-follow-ups">Review overdue</a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
            onComplete={setCompletingTask}
            onMiss={(id) => update.mutate({ id, status: "missed" })}
          />
        </TabsContent>
        <TabsContent value="overdue" id="overdue-follow-ups">
          <FollowUpList
            isLoading={isLoading}
            items={groups.overdue}
            empty="Nothing overdue. Great job!"
            onComplete={setCompletingTask}
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

      <CompleteFollowUpDialog
        task={completingTask}
        open={!!completingTask}
        isSaving={complete.isPending}
        onOpenChange={(open) => !open && setCompletingTask(null)}
        onSubmit={async (values) => {
          await complete.mutateAsync(values);
          setCompletingTask(null);
        }}
      />
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
  onComplete?: (task: FollowUpWithRelations) => void;
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
              className={`flex flex-wrap items-center justify-between gap-3 p-4 ${
                overdue ? "bg-destructive/5" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {f.lead?.full_name ?? "Unknown lead"}
                    <Badge variant="outline" className="text-[10px]">
                      {FOLLOW_UP_TYPE_LABELS[f.followup_type ?? f.type]}
                    </Badge>
                    <Badge
                      variant={
                        f.priority === "high" || f.priority === "urgent"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {FOLLOW_UP_PRIORITY_LABELS[f.priority]}
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
                    onClick={() => onComplete(f)}
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

type CompleteValues = {
  id: string;
  remarks: string;
  next_followup_type?: FollowUpType;
  next_due_date?: string | null;
  next_due_time?: string | null;
  next_priority?: FollowUpPriority;
  next_remarks?: string | null;
};

function nextDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nextTime(task: FollowUpWithRelations | null) {
  return task ? format(new Date(task.scheduled_at), "HH:mm") : "10:00";
}

function CompleteFollowUpDialog({
  task,
  open,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  task: FollowUpWithRelations | null;
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CompleteValues) => Promise<void>;
}) {
  const needsNext =
    !!task?.lead?.status && !terminalStatuses.has(task.lead.status as LeadStatus);
  const schema = React.useMemo(
    () =>
      z
        .object({
          remarks: z.string().trim().min(1, "Completion notes are required"),
          next_followup_type: z.enum(followUpTypes as [FollowUpType, ...FollowUpType[]]),
          next_due_date: z.string().optional().or(z.literal("")),
          next_due_time: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM").optional().or(z.literal("")),
          next_priority: z.enum(priorities as [FollowUpPriority, ...FollowUpPriority[]]),
          next_remarks: z.string().optional().or(z.literal("")),
        })
        .superRefine((values, ctx) => {
          if (!needsNext) return;
          if (!values.next_due_date) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["next_due_date"],
              message: "Next follow-up date is required",
            });
          }
          if (!values.next_due_time) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["next_due_time"],
              message: "Next follow-up time is required",
            });
          }
        }),
    [needsNext],
  );
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      remarks: "",
      next_followup_type: task?.followup_type ?? task?.type ?? "call",
      next_due_date: nextDate(),
      next_due_time: nextTime(task),
      next_priority: task?.priority ?? "normal",
      next_remarks: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      remarks: "",
      next_followup_type: task?.followup_type ?? task?.type ?? "call",
      next_due_date: nextDate(),
      next_due_time: nextTime(task),
      next_priority: task?.priority ?? "normal",
      next_remarks: "",
    });
  }, [form, open, task]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete follow-up</DialogTitle>
          <DialogDescription>
            Add completion notes{needsNext ? " and schedule the next follow-up." : "."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) =>
              onSubmit({
                id: task?.id ?? "",
                remarks: values.remarks,
                next_followup_type: values.next_followup_type,
                next_due_date: needsNext ? values.next_due_date || null : null,
                next_due_time: needsNext ? values.next_due_time || null : null,
                next_priority: values.next_priority,
                next_remarks: values.next_remarks || null,
              }),
            )}
          >
            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Completion notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="What happened on this follow-up?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {needsNext ? (
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-3 text-sm font-medium">Next follow-up</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="next_due_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="next_due_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="next_followup_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {followUpTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {FOLLOW_UP_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="next_priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {priorities.map((priority) => (
                              <SelectItem key={priority} value={priority}>
                                {FOLLOW_UP_PRIORITY_LABELS[priority]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="next_remarks"
                  render={({ field }) => (
                    <FormItem className="mt-3">
                      <FormLabel>Next task remarks</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !task}>
                {isSaving ? "Completing..." : "Complete follow-up"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
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
