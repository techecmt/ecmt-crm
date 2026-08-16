"use client";

import * as React from "react";
import { PhoneCall, Search } from "lucide-react";

import { CallbackRequestCard } from "@/components/callback-requests/callback-request-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallbackRequests } from "@/lib/hooks/use-callback-requests";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  CALLBACK_REQUEST_STATUS_LABELS,
  type CallbackRequestStatus,
} from "@/lib/types";

export function CallbackRequestsPageClient() {
  const [status, setStatus] = React.useState<CallbackRequestStatus | "all">("all");
  const [search, setSearch] = React.useState("");
  const { data: requests, isLoading, error } = useCallbackRequests({ status });
  const { data: profiles = [] } = useProfiles();

  const visibleRequests = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return requests ?? [];
    return (requests ?? []).filter((request) =>
      [request.full_name, request.email, request.phone, request.course, request.lead?.full_name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [requests, search]);

  const newCount = (requests ?? []).filter((request) => request.status === "new").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Callback requests</h1>
          <p className="text-sm text-muted-foreground">
            Assign, contact, and complete website callback requests.
          </p>
        </div>
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="font-medium">{newCount}</span> new request{newCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by student, email, phone, course, or lead"
          />
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as CallbackRequestStatus | "all")}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(CALLBACK_REQUEST_STATUS_LABELS) as CallbackRequestStatus[]).map((value) => (
              <SelectItem key={value} value={value}>
                {CALLBACK_REQUEST_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load callback requests: {error.message}
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed text-center">
          <PhoneCall className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No callback requests found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Website submissions will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleRequests.map((request) => (
            <CallbackRequestCard
              key={request.id}
              request={request}
              profiles={profiles}
              showLeadLink
            />
          ))}
        </div>
      )}
    </div>
  );
}
