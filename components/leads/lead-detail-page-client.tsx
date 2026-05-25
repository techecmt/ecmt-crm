"use client";

import * as React from "react";
import Link from "next/link";
import { differenceInCalendarDays, format, formatDistanceToNow, isPast } from "date-fns";
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  StickyNote,
  Target,
  UserCircle2,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  useAddLeadNote,
  useLead,
  useLeadActivities,
} from "@/lib/hooks/use-leads";
import {
  ADMISSION_GOAL_STATUS_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  FOLLOW_UP_PRIORITY_LABELS,
  LEAD_SOURCE_LABELS,
  type Lead,
} from "@/lib/types";
import { LeadStatusBadge } from "@/components/leads/status-badge";
import { LeadFormSheet } from "@/components/leads/lead-form-sheet";
import { useFollowUps } from "@/lib/hooks/use-follow-ups";
import { FollowUpFormDialog } from "@/components/follow-ups/follow-up-form-dialog";
import {
  useAdmissionGoals,
  useRecordAdmissionGoalEvent,
} from "@/lib/hooks/use-admission-goals";

export function LeadDetailPageClient({ leadId }: { leadId: string }) {
  const { data: lead, isLoading } = useLead(leadId);
  const { data: activities } = useLeadActivities(leadId);
  const { data: followUps } = useFollowUps({ leadId });
  const { data: admissionGoals } = useAdmissionGoals({ status: "all" });
  const addNote = useAddLeadNote();
  const recordGoalEvent = useRecordAdmissionGoalEvent();
  const [editing, setEditing] = React.useState(false);
  const [followUpOpen, setFollowUpOpen] = React.useState(false);
  const [noteTitle, setNoteTitle] = React.useState("");
  const [noteBody, setNoteBody] = React.useState("");
  const pendingFollowUps = React.useMemo(
    () => (followUps ?? []).filter((f) => f.status === "pending"),
    [followUps],
  );
  const lastCompletedFollowUp = React.useMemo(
    () =>
      (followUps ?? [])
        .filter((f) => f.status === "completed" && f.completed_at)
        .sort(
          (a, b) =>
            new Date(b.completed_at ?? b.scheduled_at).getTime() -
            new Date(a.completed_at ?? a.scheduled_at).getTime(),
        )[0],
    [followUps],
  );
  const daysSinceLastFollowUp = lastCompletedFollowUp?.completed_at
    ? differenceInCalendarDays(new Date(), new Date(lastCompletedFollowUp.completed_at))
    : differenceInCalendarDays(new Date(), new Date(lead?.created_at ?? new Date()));
  const linkedAdmissionGoals = React.useMemo(
    () =>
      (admissionGoals ?? []).filter((goal) =>
        goal.links.some((link) => link.lead_id === leadId),
      ),
    [admissionGoals, leadId],
  );

  const onAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    await addNote.mutateAsync({
      leadId,
      title: noteTitle.trim(),
      description: noteBody.trim() || null,
    });
    setNoteTitle("");
    setNoteBody("");
  };

  if (isLoading || !lead) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/leads">Leads</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{lead.full_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/leads">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to leads
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {lead.full_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Created {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button onClick={() => setFollowUpOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            New follow-up
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Lead profile</CardTitle>
              <CardDescription>Contact, course and assignment.</CardDescription>
            </div>
            <LeadStatusBadge status={lead.status} />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field icon={<Phone className="h-4 w-4" />} label="Phone" value={lead.phone} />
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              value={lead.email ?? "—"}
            />
            <Field
              icon={<MapPin className="h-4 w-4" />}
              label="City"
              value={lead.city ?? "—"}
            />
            <Field
              icon={<Building2 className="h-4 w-4" />}
              label="College"
              value={lead.college?.name ?? "Unassigned"}
            />
            <Field
              icon={<UserCircle2 className="h-4 w-4" />}
              label="Counsellor"
              value={
                lead.counsellor?.full_name || lead.counsellor?.email || "Unassigned"
              }
            />
            <Field
              icon={<MessageSquare className="h-4 w-4" />}
              label="Source"
              value={LEAD_SOURCE_LABELS[lead.source]}
            />
            <Field label="Course" value={lead.interested_course ?? "—"} />
            <Field label="Lead score" value={String(lead.lead_score)} />
            <Field
              label="Pending follow-ups"
              value={pendingFollowUps.length ? String(pendingFollowUps.length) : "None"}
            />
            <Field
              label="Lead aging"
              value={`${daysSinceLastFollowUp} day${daysSinceLastFollowUp === 1 ? "" : "s"} since last follow-up`}
            />
            {lead.notes ? (
              <div className="sm:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Notes
                </div>
                <p className="text-sm">{lead.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a note</CardTitle>
            <CardDescription>
              Capture context after a call or interaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAddNote} className="space-y-3">
              <Input
                placeholder="Note title (e.g. Called, busy)"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
              <Textarea
                rows={4}
                placeholder="Optional description"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <Button type="submit" disabled={addNote.isPending} className="w-full">
                <StickyNote className="mr-2 h-4 w-4" />
                Add note
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admission goals</CardTitle>
            <CardDescription>
              Goal links and milestone actions for this lead.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {linkedAdmissionGoals.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No linked admission goals yet.
              </div>
            ) : (
              linkedAdmissionGoals.map((goal) => {
                const hasVisa = goal.events.some(
                  (event) =>
                    event.lead_id === leadId && event.event_type === "visa_approved",
                );
                const progress =
                  goal.target_count > 0
                    ? Math.min(100, Math.round((goal.achieved_count / goal.target_count) * 100))
                    : 0;
                return (
                  <div key={goal.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          {goal.title}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {goal.achieved_count}/{goal.target_count} admissions · {progress}%
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {ADMISSION_GOAL_STATUS_LABELS[goal.status]}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant={hasVisa ? "secondary" : "outline"}
                      disabled={hasVisa || recordGoalEvent.isPending}
                      className="mt-3 w-full"
                      onClick={() =>
                        recordGoalEvent.mutate({
                          goalId: goal.id,
                          leadId,
                          eventType: "visa_approved",
                        })
                      }
                    >
                      {hasVisa ? "Visa approved recorded" : "Mark visa approved"}
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="follow-ups">
            Follow-ups
            {followUps && followUps.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {followUps.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <Card>
            <CardContent className="pt-6">
              {!activities || activities.length === 0 ? (
                <EmptyState text="No activity yet. Notes, follow-ups and status changes will appear here." />
              ) : (
                <ol className="relative space-y-5 border-l pl-6">
                  {activities.map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full border bg-background">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{a.title}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {a.type.replace("_", " ")}
                        </Badge>
                      </div>
                      {a.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {a.description}
                        </p>
                      ) : null}
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[10px]">
                            {(a.user?.full_name || a.user?.email || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {a.user?.full_name || a.user?.email || "System"}
                        </span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>{format(new Date(a.created_at), "PPp")}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="follow-ups">
          <Card>
            <CardContent className="pt-6">
              {!followUps || followUps.length === 0 ? (
                <EmptyState text="No follow-ups yet. Schedule one to keep this lead warm." />
              ) : (
                <ul className="divide-y">
                  {followUps.map((f) => {
                    const overdue = f.status === "pending" && isPast(new Date(f.scheduled_at));
                    return (
                    <li
                      key={f.id}
                      className={`flex flex-wrap items-center justify-between gap-2 py-3 ${
                        overdue ? "rounded-md bg-destructive/5 px-2" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {f.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-600" />
                          )}
                          {FOLLOW_UP_TYPE_LABELS[f.followup_type ?? f.type]} —{" "}
                          {format(new Date(f.scheduled_at), "PPp")}
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
                        {f.remarks ?? f.notes ? (
                          <p className="ml-6 mt-1 text-xs text-muted-foreground">
                            {f.remarks ?? f.notes}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant={
                          f.status === "completed"
                            ? "default"
                            : f.status === "missed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {f.status}
                      </Badge>
                    </li>
                  );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LeadFormSheet
        open={editing}
        onOpenChange={setEditing}
        lead={lead as unknown as Lead}
      />
      <FollowUpFormDialog
        open={followUpOpen}
        onOpenChange={setFollowUpOpen}
        leadId={leadId}
        followUp={null}
      />
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon ? <div className="mt-0.5 text-muted-foreground">{icon}</div> : null}
      <div className="flex-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
  );
}
