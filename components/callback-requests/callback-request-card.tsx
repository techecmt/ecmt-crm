"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Mail, Phone, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppPhoneLink } from "@/components/phone/whatsapp-phone-link";
import {
  type CallbackRequestWithRelations,
  useUpdateCallbackRequest,
} from "@/lib/hooks/use-callback-requests";
import { formatSgtDate } from "@/lib/timezone";
import {
  CALLBACK_REQUEST_STATUS_LABELS,
  type CallbackRequestStatus,
  type Profile,
} from "@/lib/types";

const STATUS_VARIANTS: Record<
  CallbackRequestStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  new: "default",
  contacted: "secondary",
  completed: "outline",
  cancelled: "destructive",
};

export function CallbackRequestCard({
  request,
  profiles,
  showLeadLink = false,
}: {
  request: CallbackRequestWithRelations;
  profiles: Profile[];
  showLeadLink?: boolean;
}) {
  const updateRequest = useUpdateCallbackRequest();
  const [status, setStatus] = React.useState<CallbackRequestStatus>(request.status);
  const [assignedCounsellor, setAssignedCounsellor] = React.useState(
    request.assigned_counsellor ?? "unassigned",
  );
  const [notes, setNotes] = React.useState(request.notes ?? "");

  React.useEffect(() => {
    setStatus(request.status);
    setAssignedCounsellor(request.assigned_counsellor ?? "unassigned");
    setNotes(request.notes ?? "");
  }, [request]);

  const onSave = () =>
    updateRequest.mutate({
      id: request.id,
      leadId: request.lead_id,
      status,
      assignedCounsellor:
        assignedCounsellor === "unassigned" ? null : assignedCounsellor,
      notes,
    });

  return (
    <Card>
      <CardHeader className="gap-3 space-y-0 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">{request.full_name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{request.course}</p>
          {showLeadLink && request.lead ? (
            <Link
              className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline"
              href={`/dashboard/leads/${request.lead.id}`}
            >
              View lead: {request.lead.full_name}
            </Link>
          ) : null}
        </div>
        <Badge variant={STATUS_VARIANTS[request.status]}>
          {CALLBACK_REQUEST_STATUS_LABELS[request.status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <WhatsAppPhoneLink phone={request.phone} className="text-foreground" />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <a className="truncate hover:underline" href={`mailto:${request.email}`}>
              {request.email}
            </a>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span>
              Preferred: {formatSgtDate(request.preferred_date)} at{" "}
              {request.preferred_time.slice(0, 5)} ({request.preferred_timezone})
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Request status
            </label>
            <Select value={status} onValueChange={(value) => setStatus(value as CallbackRequestStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CALLBACK_REQUEST_STATUS_LABELS) as CallbackRequestStatus[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {CALLBACK_REQUEST_STATUS_LABELS[value]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Assign counsellor
            </label>
            <Select value={assignedCounsellor} onValueChange={setAssignedCounsellor}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {profiles
                  .filter((profile) => profile.is_active)
                  .map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Counsellor notes
          </label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Capture the callback outcome or next action."
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            Submitted {formatSgtDate(request.created_at)}
          </span>
          <Button size="sm" onClick={onSave} disabled={updateRequest.isPending}>
            Save request
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
