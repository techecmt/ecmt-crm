"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Clock3, ExternalLink, Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WhatsAppPhoneLink } from "@/components/phone/whatsapp-phone-link";
import { LeadStatusBadge } from "@/components/leads/status-badge";
import {
  AppointmentModeIcon,
  CounsellorPicker,
  OverdueBadge,
  QuickContactActions,
  RequestStatusBadge,
  RequestTypeBadge,
  StatusPicker,
  appointmentModeLabel,
  counsellorLabel,
} from "@/components/callback-requests/request-controls";
import {
  useCallbackRequestPatch,
  type CallbackRequestWithRelations,
} from "@/lib/hooks/use-callback-requests";
import { useNowMs } from "@/lib/hooks/use-now";
import {
  formatTimeLabel,
  isOverdueRequest,
  relativeDayLabel,
} from "@/lib/callback-requests-view";
import { formatSgtDate } from "@/lib/timezone";
import {
  CALLBACK_REQUEST_STATUS_LABELS,
  isAssignableCounsellor,
  type Profile,
} from "@/lib/types";

export function CallbackRequestCard({
  request,
  profiles,
  showLeadLink = false,
}: {
  request: CallbackRequestWithRelations;
  profiles: Profile[];
  showLeadLink?: boolean;
}) {
  const patchRequest = useCallbackRequestPatch();
  const nowMs = useNowMs();
  const [notes, setNotes] = React.useState(request.notes ?? "");
  const isAppointment = request.request_type === "appointment";
  const overdue = isOverdueRequest(request, nowMs);

  const assignableCounsellors = React.useMemo(() => {
    const eligible = profiles.filter(isAssignableCounsellor);
    const selected = profiles.find((profile) => profile.id === request.assigned_counsellor);
    if (selected && !eligible.some((profile) => profile.id === selected.id)) {
      return [selected, ...eligible];
    }
    return eligible;
  }, [profiles, request.assigned_counsellor]);

  const leadCounsellorId = request.lead?.assigned_counsellor ?? null;
  const leadCounsellorName = leadCounsellorId
    ? counsellorLabel(leadCounsellorId, profiles)
    : null;

  // Keep the draft in step when the request is refetched or changed elsewhere.
  React.useEffect(() => {
    setNotes(request.notes ?? "");
  }, [request.notes]);

  const notesDirty = notes.trim() !== (request.notes ?? "").trim();
  const scheduleLabel = relativeDayLabel(request.preferred_date);

  return (
    <TooltipProvider delayDuration={200}>
      <Card className={overdue ? "border-rose-200 dark:border-rose-500/30" : undefined}>
        <CardHeader className="gap-3 space-y-0 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{request.full_name}</CardTitle>
              <RequestTypeBadge type={request.request_type ?? "callback"} />
              {overdue ? <OverdueBadge /> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{request.course}</p>
            {showLeadLink && request.lead_id ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Link
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                  href={`/dashboard/leads/${request.lead_id}`}
                >
                  <ExternalLink className="h-3 w-3" />
                  {request.lead?.full_name ? `Lead: ${request.lead.full_name}` : "View lead"}
                </Link>
                {request.lead?.status ? <LeadStatusBadge status={request.lead.status} /> : null}
              </div>
            ) : null}
          </div>
          <RequestStatusBadge status={request.status} />
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">
                {formatSgtDate(request.preferred_date)} · {formatTimeLabel(request.preferred_time)}
              </span>
              {scheduleLabel ? (
                <span className="text-xs text-muted-foreground">({scheduleLabel})</span>
              ) : null}
              <span className="text-xs text-muted-foreground">{request.preferred_timezone}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <AppointmentModeIcon
                  mode={isAppointment ? request.appointment_mode : "phone"}
                  className="h-3.5 w-3.5"
                />
                {isAppointment ? appointmentModeLabel(request.appointment_mode) : "Callback"}
              </span>
              {isAppointment ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" />
                  {request.duration_minutes ?? 30} minutes
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid min-w-0 gap-1 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <WhatsAppPhoneLink phone={request.phone} className="text-sm" />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <a className="truncate hover:underline" href={`mailto:${request.email}`}>
                  {request.email}
                </a>
              </div>
            </div>
            <QuickContactActions phone={request.phone} email={request.email} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Request status
              </label>
              <StatusPicker
                className="h-9 w-full text-sm"
                value={request.status}
                disabled={patchRequest.isPending}
                onChange={(status) =>
                  patchRequest.mutate({
                    request,
                    patch: { status },
                    message: `Marked ${CALLBACK_REQUEST_STATUS_LABELS[status].toLowerCase()}`,
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Assigned counsellor
              </label>
              <CounsellorPicker
                className="h-9 w-full text-sm"
                value={request.assigned_counsellor}
                counsellors={assignableCounsellors}
                disabled={patchRequest.isPending}
                onChange={(counsellorId) =>
                  patchRequest.mutate({
                    request,
                    patch: { assignedCounsellor: counsellorId },
                    message: counsellorId
                      ? `Assigned to ${counsellorLabel(counsellorId, profiles)}`
                      : "Request unassigned",
                  })
                }
              />
              {leadCounsellorName && request.assigned_counsellor !== leadCounsellorId ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Lead is assigned to {leadCounsellorName}
                  {request.assigned_counsellor
                    ? ". Assigning here moves the lead too."
                    : "."}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Counsellor notes
            </label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                isAppointment
                  ? "Confirm the slot, meeting link, or campus details."
                  : "Capture the callback outcome or next action."
              }
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Submitted {formatSgtDate(request.created_at)}
            </span>
            <div className="flex items-center gap-2">
              {notesDirty ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setNotes(request.notes ?? "")}
                  disabled={patchRequest.isPending}
                >
                  Discard
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={!notesDirty || patchRequest.isPending}
                onClick={() =>
                  patchRequest.mutate({
                    request,
                    patch: { notes },
                    message: "Note saved",
                  })
                }
              >
                {notesDirty ? "Save note" : "Saved"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
