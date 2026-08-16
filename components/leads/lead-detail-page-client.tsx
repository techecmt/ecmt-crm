"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Bot,
  Globe2,
  Loader2,
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
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import {
  useAddLeadNote,
  useLead,
  useLeadActivities,
  useLeads,
} from "@/lib/hooks/use-leads";
import {
  buildLeadDetailHref,
  buildSortedLeadList,
  getAdjacentLeadIds,
  parseLeadsListStateFromReturnPath,
  toLeadFilters,
} from "@/lib/leads-list-navigation";
import {
  ADMISSION_GOAL_STATUS_LABELS,
  COUNSELLING_CHECK_KEYS,
  COUNSELLING_CHECK_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  FOLLOW_UP_PRIORITY_LABELS,
  HIGHEST_QUALIFICATION_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  NOT_INTERESTED_REASON_LABELS,
  type Lead,
} from "@/lib/types";
import { LeadStatusSelect } from "@/components/leads/status-select";
import { LeadFormSheet } from "@/components/leads/lead-form-sheet";
import {
  useCompleteFollowUpTask,
  useFollowUps,
  nextUpcomingPerLead,
  type FollowUpWithRelations,
} from "@/lib/hooks/use-follow-ups";
import { FollowUpFormDialog } from "@/components/follow-ups/follow-up-form-dialog";
import { CompleteFollowUpDialog } from "@/components/follow-ups/complete-follow-up-dialog";
import { CallbackRequestCard } from "@/components/callback-requests/callback-request-card";
import { WhatsAppPhoneLink } from "@/components/phone/whatsapp-phone-link";
import {
  useAdmissionGoals,
  useRecordAdmissionGoalEvent,
} from "@/lib/hooks/use-admission-goals";
import { useLeadMessages, type LeadConversation } from "@/lib/hooks/use-lead-messages";
import { useCallbackRequests } from "@/lib/hooks/use-callback-requests";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { differenceInSgtCalendarDays, formatSgtDate, formatSgtDateTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export function LeadDetailPageClient({ leadId }: { leadId: string }) {
  const params = useSearchParams();
  const { data: currentProfile } = useCurrentProfile();
  const backToLeadsHref = React.useMemo(() => {
    const raw = params.get("from");
    if (!raw) return "/dashboard/leads";
    return raw.startsWith("/dashboard/leads") ? raw : "/dashboard/leads";
  }, [params]);
  const listNavigationState = React.useMemo(
    () =>
      parseLeadsListStateFromReturnPath(
        backToLeadsHref,
        currentProfile?.id ?? "",
      ),
    [backToLeadsHref, currentProfile?.id],
  );
  const { data: listLeads, isLoading: isListLoading } = useLeads({
    ...toLeadFilters(listNavigationState),
    enabled: !!currentProfile?.id,
  });
  const leadNavigation = React.useMemo(() => {
    if (!listLeads?.length) {
      return { prevId: null, nextId: null, index: -1, total: 0 };
    }
    const sorted = buildSortedLeadList(listLeads, listNavigationState);
    return getAdjacentLeadIds(sorted, leadId);
  }, [leadId, listLeads, listNavigationState]);
  const showLeadNavigation =
    leadNavigation.index >= 0 && leadNavigation.total > 1;
  const { data: lead, isLoading } = useLead(leadId);
  const { data: activities } = useLeadActivities(leadId);
  const { data: conversations = [], isLoading: messagesLoading } = useLeadMessages(leadId);
  const { data: followUps } = useFollowUps({ leadId });
  const { data: callbackRequests = [], isLoading: callbackRequestsLoading } =
    useCallbackRequests({ leadId });
  const { data: profiles = [] } = useProfiles();
  const completeFollowUp = useCompleteFollowUpTask();
  const { data: admissionGoals } = useAdmissionGoals({ status: "all" });
  const addNote = useAddLeadNote();
  const recordGoalEvent = useRecordAdmissionGoalEvent();
  const [editing, setEditing] = React.useState(false);
  const [followUpOpen, setFollowUpOpen] = React.useState(false);
  const [completingTask, setCompletingTask] =
    React.useState<FollowUpWithRelations | null>(null);
  const [noteTitle, setNoteTitle] = React.useState("");
  const [noteBody, setNoteBody] = React.useState("");
  const noteActivities = React.useMemo(
    () => (activities ?? []).filter((activity) => activity.type === "note"),
    [activities],
  );
  const pendingFollowUps = React.useMemo(
    () => (followUps ?? []).filter((f) => f.status === "pending"),
    [followUps],
  );
  const nextPending = React.useMemo(() => {
    const list = nextUpcomingPerLead(followUps ?? []);
    return list[0];
  }, [followUps]);
  const allPendingFollowUps = React.useMemo(
    () =>
      (followUps ?? [])
        .filter((f) => f.status === "pending")
        .sort(
          (a, b) =>
            new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
        ),
    [followUps],
  );
  const completedFollowUps = React.useMemo(
    () =>
      (followUps ?? [])
        .filter((f) => f.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.completed_at ?? b.scheduled_at).getTime() -
            new Date(a.completed_at ?? a.scheduled_at).getTime(),
        ),
    [followUps],
  );
  const counsellingFollowUps = React.useMemo(
    () =>
      (followUps ?? [])
        .filter((f) => f.sequence != null)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    [followUps],
  );
  const completedCounsellingCount = counsellingFollowUps.filter(
    (f) => f.status === "completed",
  ).length;
  const totalCounsellingFollowUps = counsellingFollowUps.length;
  const completedCounsellingDisplayCount = completedCounsellingCount;
  const lastCompletedFollowUp = completedFollowUps[0];
  const daysSinceLastFollowUp = lastCompletedFollowUp?.completed_at
    ? differenceInSgtCalendarDays(new Date(), lastCompletedFollowUp.completed_at)
    : differenceInSgtCalendarDays(new Date(), lead?.created_at ?? new Date());
  const linkedAdmissionGoals = React.useMemo(
    () =>
      (admissionGoals ?? []).filter((goal) =>
        goal.links.some((link) => link.lead_id === leadId),
      ),
    [admissionGoals, leadId],
  );
  const leadToRegistrationDays = lead?.registration_completed_at
    ? Math.max(
        differenceInSgtCalendarDays(lead.registration_completed_at, lead.created_at),
        0,
      )
    : null;

  const onAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    if (!noteTitle.trim()) return;
    await addNote.mutateAsync({
      leadId,
      title: noteTitle.trim(),
      description: noteBody.trim() || null,
      status: lead.status,
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
              <Link href={backToLeadsHref}>Leads</Link>
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
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={backToLeadsHref}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to leads
              </Link>
            </Button>
            {showLeadNavigation ? (
              <div className="flex items-center gap-1">
                {leadNavigation.prevId ? (
                  <Button asChild variant="outline" size="icon" className="h-8 w-8">
                    <Link
                      href={buildLeadDetailHref(leadNavigation.prevId, backToLeadsHref)}
                      aria-label="Previous lead"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled
                    aria-label="Previous lead"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                {leadNavigation.nextId ? (
                  <Button asChild variant="outline" size="icon" className="h-8 w-8">
                    <Link
                      href={buildLeadDetailHref(leadNavigation.nextId, backToLeadsHref)}
                      aria-label="Next lead"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled
                    aria-label="Next lead"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
                <span className="ml-1 text-xs text-muted-foreground">
                  {leadNavigation.index + 1} of {leadNavigation.total}
                </span>
              </div>
            ) : isListLoading ? (
              <span className="text-xs text-muted-foreground">Loading list…</span>
            ) : null}
          </div>
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
            <LeadStatusSelect lead={lead} />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              icon={<Phone className="h-4 w-4" />}
              label="Phone"
              value={<WhatsAppPhoneLink phone={lead.phone} className="text-sm text-foreground" />}
            />
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
              label="Nationality"
              value={
                lead.nationality === "Other" && lead.nationality_other
                  ? `Other (${lead.nationality_other})`
                  : lead.nationality ?? "—"
              }
            />
            <Field
              label="Highest qualification"
              value={
                lead.highest_qualification
                  ? lead.highest_qualification === "other"
                    ? `Other${lead.highest_qualification_other ? ` (${lead.highest_qualification_other})` : ""}`
                    : HIGHEST_QUALIFICATION_LABELS[lead.highest_qualification]
                  : "—"
              }
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
            {lead.description ? (
              <div className="sm:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Description
                </div>
                <p className="text-sm">{lead.description}</p>
              </div>
            ) : null}
            {lead.registration_completed_at ? (
              <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Registration Completed
                </div>
                <p className="mt-1 text-sm">
                  {formatSgtDate(lead.registration_completed_at)}
                </p>
                {leadToRegistrationDays !== null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Took {leadToRegistrationDays} day{leadToRegistrationDays === 1 ? "" : "s"} from lead creation
                  </p>
                ) : null}
              </div>
            ) : null}
            {lead.status === "not_interested" && lead.not_interested_reason ? (
              <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Not Interested · {NOT_INTERESTED_REASON_LABELS[lead.not_interested_reason]}
                </div>
                <p className="mt-1 text-sm">{lead.not_interested_notes ?? "—"}</p>
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

      {counsellingFollowUps.length > 0 || lead.status === "counselling_in_progress" || lead.status === "counselling_completed" ? (
        <Card>
          <CardHeader>
            <CardTitle>Counselling pipeline</CardTitle>
            <CardDescription>
              2 follow-ups are scheduled when counselling starts, then 2 more
              are added on counselling completion (72-hour intervals).
              {lead.status === "counselling_completed" && lead.counselling_completed_at ? (
                <>
                  {" "}Completed {formatSgtDate(lead.counselling_completed_at)}.
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">
                {completedCounsellingDisplayCount}/{totalCounsellingFollowUps} follow-ups completed
              </Badge>
              {nextPending && nextPending.sequence ? (
                <Badge variant="outline">
                  Next: follow-up #{nextPending.sequence} on{" "}
                  {formatSgtDateTime(nextPending.scheduled_at)}
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {counsellingFollowUps.map((item) => {
                const isDone = item.status === "completed";
                const isUpcoming = item.status === "pending";
                const isNext =
                  nextPending?.id === item.id && item.status === "pending";
                return (
                  <div
                    key={item.id}
                    className={`rounded-md border p-3 ${
                      isDone ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
                    } ${isNext ? "border-primary/40 bg-primary/[0.03]" : ""}`}
                  >
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span>Follow-up #{item.sequence}</span>
                      {isDone ? (
                        <Badge variant="default" className="text-[10px]">Done</Badge>
                      ) : isNext ? (
                        <Badge variant="default" className="text-[10px]">Next up</Badge>
                      ) : isUpcoming ? (
                        <Badge variant="secondary" className="text-[10px]">Scheduled</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatSgtDateTime(item.scheduled_at)}
                    </div>
                    {item.completed_at ? (
                      <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                        Completed {formatSgtDate(item.completed_at)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {lead.status === "counselling_completed" && (
              <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
                <div className="text-sm font-medium">Counselling checks</div>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {COUNSELLING_CHECK_KEYS.map((key) => (
                    <li
                      key={key}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                          lead.counselling_checks?.[key]
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {lead.counselling_checks?.[key] ? "✓" : ""}
                      </span>
                      {COUNSELLING_CHECK_LABELS[key]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="messages">
            Messages
            {conversations.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {conversations.reduce(
                  (total, conversation) => total + conversation.messages.length,
                  0,
                )}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes
            {noteActivities.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {noteActivities.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="follow-ups">
            Follow-ups
            {pendingFollowUps.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {pendingFollowUps.length}
              </Badge>
            ) : completedFollowUps.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {completedFollowUps.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="callback-requests">
            Callback requests
            {callbackRequests.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {callbackRequests.length}
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
                        {a.type === "note" &&
                        typeof a.metadata?.status_at_note === "string" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Status:{" "}
                            {
                              LEAD_STATUS_LABELS[
                                a.metadata.status_at_note as keyof typeof LEAD_STATUS_LABELS
                              ]
                            }
                          </Badge>
                        ) : null}
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
                        <span>{formatSgtDateTime(a.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                Conversation history
              </CardTitle>
              <CardDescription>
                Messages exchanged between the visitor, ESRA AI, and counselors across all linked channels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {messagesLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading messages...
                </div>
              ) : conversations.length === 0 ? (
                <EmptyState text="No conversations are linked to this lead yet." />
              ) : (
                <div className="space-y-5">
                  {conversations.map((conversation) => (
                    <LeadConversationTranscript
                      key={conversation.id}
                      conversation={conversation}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notes">
          <Card>
            <CardContent className="pt-6">
              {noteActivities.length === 0 ? (
                <EmptyState text="No notes added yet for this lead." />
              ) : (
                <ul className="space-y-3">
                  {noteActivities.map((note) => (
                    <li key={note.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{note.title}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {formatSgtDateTime(note.created_at)}
                        </Badge>
                        {typeof note.metadata?.status_at_note === "string" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {
                              LEAD_STATUS_LABELS[
                                note.metadata.status_at_note as keyof typeof LEAD_STATUS_LABELS
                              ]
                            }
                          </Badge>
                        ) : null}
                      </div>
                      {note.description ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {note.description}
                        </p>
                      ) : null}
                      <div className="mt-2 text-xs text-muted-foreground">
                        Added by {note.user?.full_name || note.user?.email || "System"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="follow-ups">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div>
                <div className="mb-2 text-sm font-medium">
                  Pending follow-ups
                  {allPendingFollowUps.length > 0 ? (
                    <span className="ml-1 text-muted-foreground">
                      ({allPendingFollowUps.length})
                    </span>
                  ) : null}
                </div>
                {allPendingFollowUps.length === 0 ? (
                  <EmptyState text="No pending follow-ups." />
                ) : (
                  <ul className="divide-y">
                    {allPendingFollowUps.map((f, index) => (
                      <li key={f.id} className="py-3">
                        <FollowUpRow
                          followUp={f}
                          isNextUp={index === 0}
                          onComplete={setCompletingTask}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Separator />
              <div>
                <div className="mb-2 text-sm font-medium">
                  Completed follow-ups
                  {completedFollowUps.length > 0 ? (
                    <span className="ml-1 text-muted-foreground">
                      ({completedFollowUps.length})
                    </span>
                  ) : null}
                </div>
                {completedFollowUps.length === 0 ? (
                  <EmptyState text="No completed follow-ups yet." />
                ) : (
                  <ul className="divide-y">
                    {completedFollowUps.map((f) => (
                      <li key={f.id} className="py-3">
                        <FollowUpRow followUp={f} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="callback-requests">
          <Card>
            <CardHeader>
              <CardTitle>Callback requests</CardTitle>
              <CardDescription>
                Website callback requests linked to this lead.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {callbackRequestsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : callbackRequests.length === 0 ? (
                <EmptyState text="No callback requests are linked to this lead." />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {callbackRequests.map((request) => (
                    <CallbackRequestCard
                      key={request.id}
                      request={request}
                      profiles={profiles}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CompleteFollowUpDialog
        task={completingTask}
        open={!!completingTask}
        isSaving={completeFollowUp.isPending}
        onOpenChange={(open) => !open && setCompletingTask(null)}
        onSubmit={async (values) => {
          await completeFollowUp.mutateAsync(values);
          setCompletingTask(null);
        }}
      />
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

function FollowUpRow({
  followUp,
  isNextUp = false,
  onComplete,
}: {
  followUp: FollowUpWithRelations;
  isNextUp?: boolean;
  onComplete?: (followUp: FollowUpWithRelations) => void;
}) {
  const overdue =
    followUp.status === "pending" && isPast(new Date(followUp.scheduled_at));
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 ${
        overdue ? "rounded-md bg-destructive/5 px-2 py-1" : ""
      } ${isNextUp ? "rounded-md border border-primary/30 bg-primary/[0.03] px-2 py-1" : ""}`}
    >
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          {followUp.status === "completed" ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <Clock className="h-4 w-4 text-amber-600" />
          )}
          {FOLLOW_UP_TYPE_LABELS[followUp.followup_type ?? followUp.type]} —{" "}
          {formatSgtDateTime(followUp.scheduled_at)}
          {isNextUp ? (
            <Badge variant="default" className="text-[10px]">
              Next up
            </Badge>
          ) : null}
          {followUp.sequence ? (
            <Badge variant="outline" className="text-[10px]">
              #{followUp.sequence}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              Custom
            </Badge>
          )}
          <Badge
            variant={
              followUp.priority === "high" || followUp.priority === "urgent"
                ? "destructive"
                : "secondary"
            }
            className="text-[10px]"
          >
            {FOLLOW_UP_PRIORITY_LABELS[followUp.priority]}
          </Badge>
          {overdue ? (
            <Badge variant="destructive" className="text-[10px]">
              Overdue
            </Badge>
          ) : null}
        </div>
        {followUp.remarks ?? followUp.notes ? (
          <p className="ml-6 mt-1 text-xs text-muted-foreground">
            {followUp.remarks ?? followUp.notes}
          </p>
        ) : null}
        {followUp.assignee ? (
          <div className="ml-6 mt-1 text-[11px] text-muted-foreground">
            Assigned to {followUp.assignee.full_name ?? followUp.assignee.email}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {followUp.status === "pending" && onComplete ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onComplete(followUp)}
          >
            Complete
          </Button>
        ) : null}
        <Badge
          variant={
            followUp.status === "completed"
              ? "default"
              : followUp.status === "missed"
              ? "destructive"
              : "secondary"
          }
        >
          {followUp.status}
        </Badge>
      </div>
    </div>
  );
}

function LeadConversationTranscript({
  conversation,
}: {
  conversation: LeadConversation;
}) {
  const channelLabel =
    conversation.channel === "website"
      ? "Website chat"
      : conversation.channel === "whatsapp"
        ? "WhatsApp"
        : "Messenger";

  return (
    <section className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {conversation.channel === "website" ? (
            <Globe2 className="h-4 w-4 shrink-0 text-blue-600" />
          ) : (
            <MessageSquare className="h-4 w-4 shrink-0 text-blue-600" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">{channelLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              {conversation.name || conversation.external_user_id}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {conversation.messages.length} messages
        </Badge>
      </div>
      <div className="max-h-[32rem] space-y-3 overflow-y-auto bg-muted/10 p-4">
        {conversation.messages.map((message) => {
          const isVisitor = message.role === "user";
          const isCounselor = !isVisitor && Boolean(message.sent_by_user_id);
          const sender = isVisitor
            ? "Visitor"
            : isCounselor
              ? message.sender?.full_name || message.sender?.email || "Counselor"
              : "ESRA AI";

          return (
            <div
              key={message.id}
              className={cn("flex items-end gap-2", isVisitor ? "justify-start" : "justify-end")}
            >
              {!isVisitor ? null : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                  V
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                  isVisitor
                    ? "rounded-bl-md border bg-background text-foreground"
                    : isCounselor
                      ? "rounded-br-md bg-blue-600 text-white"
                      : "rounded-br-md bg-emerald-600 text-white",
                )}
              >
                <p
                  className={cn(
                    "mb-1 text-[10px] font-medium",
                    isVisitor ? "text-muted-foreground" : "text-white/80",
                  )}
                >
                  {sender}
                </p>
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {message.content}
                </p>
                <p
                  className={cn(
                    "mt-1 text-right text-[10px]",
                    isVisitor ? "text-muted-foreground" : "text-white/70",
                  )}
                >
                  {formatSgtDateTime(message.created_at)}
                </p>
              </div>
              {isVisitor ? null : (
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                    isCounselor ? "bg-blue-600" : "bg-emerald-600",
                  )}
                >
                  {isCounselor ? sender.charAt(0).toUpperCase() : <Bot className="h-3.5 w-3.5" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
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
