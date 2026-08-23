"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  CALLBACK_REQUEST_STATUS_LABELS,
  type CallbackRequest,
  type CallbackRequestStatus,
  type CallbackRequestType,
  type LeadStatus,
} from "@/lib/types";

export const CALLBACK_REQUESTS_KEY = ["callback_requests"] as const;

export type CallbackRequestWithRelations = CallbackRequest & {
  lead: {
    id: string;
    full_name: string;
    status: LeadStatus;
    assigned_counsellor: string | null;
  } | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

export type CallbackRequestFilters = {
  leadId?: string;
  status?: CallbackRequestStatus | "all";
  requestType?: CallbackRequestType | "all";
  assignedCounsellor?: string | "all" | "unassigned";
};

/** The fields an inline edit can change, and the shape a patch is applied against. */
export type CallbackRequestPatch = {
  status?: CallbackRequestStatus;
  assignedCounsellor?: string | null;
  notes?: string | null;
};

export type PatchableCallbackRequest = Pick<
  CallbackRequest,
  "id" | "lead_id" | "status" | "assigned_counsellor" | "notes"
>;

const CALLBACK_REQUESTS_SELECT =
  "*, lead:leads(id,full_name,status,assigned_counsellor), counsellor:profiles!callback_requests_assigned_counsellor_fkey(id,full_name,email)";

export function useCallbackRequests(filters: CallbackRequestFilters = {}) {
  return useQuery({
    queryKey: [...CALLBACK_REQUESTS_KEY, filters],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("callback_requests")
        .select(CALLBACK_REQUESTS_SELECT)
        .order("preferred_date", { ascending: true })
        .order("preferred_time", { ascending: true });

      if (filters.leadId) query = query.eq("lead_id", filters.leadId);
      if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
      if (filters.requestType && filters.requestType !== "all") {
        query = query.eq("request_type", filters.requestType);
      }
      if (filters.assignedCounsellor === "unassigned") {
        query = query.is("assigned_counsellor", null);
      } else if (filters.assignedCounsellor && filters.assignedCounsellor !== "all") {
        query = query.eq("assigned_counsellor", filters.assignedCounsellor);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CallbackRequestWithRelations[];
    },
  });
}

type CallbackRequestUpdateInput = {
  id: string;
  leadId: string;
  status: CallbackRequestStatus;
  assignedCounsellor: string | null;
  notes: string | null;
};

/**
 * Writes the request, keeps the lead's counsellor in sync, and logs a lead activity.
 * Shared by the full-card save, inline edits, and bulk actions.
 */
async function applyCallbackRequestUpdate(
  supabase: SupabaseClient,
  { id, leadId, status, assignedCounsellor, notes }: CallbackRequestUpdateInput,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current, error: currentError } = await supabase
    .from("callback_requests")
    .select("status, assigned_counsellor, request_type, notes")
    .eq("id", id)
    .single();
  if (currentError) throw new Error(currentError.message);

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, assigned_counsellor")
    .eq("id", leadId)
    .single();
  if (leadError) throw new Error(leadError.message);

  const { error } = await supabase
    .from("callback_requests")
    .update({
      status,
      assigned_counsellor: assignedCounsellor,
      notes: notes?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const previousCounsellor = current.assigned_counsellor as string | null;
  const leadCounsellor = lead.assigned_counsellor as string | null;
  const shouldSyncLeadCounsellor =
    assignedCounsellor !== null
      ? leadCounsellor !== assignedCounsellor
      : leadCounsellor !== null && leadCounsellor === previousCounsellor;

  if (shouldSyncLeadCounsellor) {
    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({ assigned_counsellor: assignedCounsellor })
      .eq("id", leadId);
    if (leadUpdateError) throw new Error(leadUpdateError.message);
  }

  let counsellorName: string | null = null;
  if (assignedCounsellor) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", assignedCounsellor)
      .maybeSingle();
    counsellorName = profile?.full_name || profile?.email || null;
  }

  const changes: string[] = [];
  if (current.status !== status) {
    changes.push(`status ${CALLBACK_REQUEST_STATUS_LABELS[status]}`);
  }
  if (previousCounsellor !== assignedCounsellor) {
    changes.push(
      assignedCounsellor ? `assigned to ${counsellorName ?? "counsellor"}` : "unassigned",
    );
  }
  if ((notes?.trim() || null) !== (current.notes?.trim() || null)) {
    changes.push("notes updated");
  }

  const requestLabel =
    current.request_type === "appointment" ? "Appointment" : "Callback request";
  const { error: activityError } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user?.id ?? null,
    type: "system",
    title: changes.length ? `${requestLabel}: ${changes.join(", ")}` : `${requestLabel} updated`,
    description: notes?.trim() || null,
    metadata: {
      callback_request_id: id,
      callback_status: status,
      assigned_counsellor: assignedCounsellor,
      synced_lead_counsellor: shouldSyncLeadCounsellor,
    },
  });
  if (activityError) throw new Error(activityError.message);
}

function mergePatch(request: PatchableCallbackRequest, patch: CallbackRequestPatch) {
  return {
    id: request.id,
    leadId: request.lead_id,
    status: patch.status ?? request.status,
    assignedCounsellor:
      patch.assignedCounsellor !== undefined
        ? patch.assignedCounsellor
        : request.assigned_counsellor,
    notes: patch.notes !== undefined ? patch.notes : request.notes,
  } satisfies CallbackRequestUpdateInput;
}

/** The patch that puts a request back the way it was, for the Undo toast action. */
function inversePatch(request: PatchableCallbackRequest, patch: CallbackRequestPatch) {
  const inverse: CallbackRequestPatch = {};
  if (patch.status !== undefined) inverse.status = request.status;
  if (patch.assignedCounsellor !== undefined) {
    inverse.assignedCounsellor = request.assigned_counsellor;
  }
  if (patch.notes !== undefined) inverse.notes = request.notes;
  return inverse;
}

function cacheFieldsFromPatch(patch: CallbackRequestPatch): Partial<CallbackRequest> {
  const fields: Partial<CallbackRequest> = {};
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.assignedCounsellor !== undefined) {
    fields.assigned_counsellor = patch.assignedCounsellor;
  }
  if (patch.notes !== undefined) fields.notes = patch.notes?.trim() || null;
  return fields;
}

type CachedLists = Array<[readonly unknown[], CallbackRequestWithRelations[] | undefined]>;

function patchCachedRequests(
  queryClient: ReturnType<typeof useQueryClient>,
  updates: Array<{ id: string; patch: CallbackRequestPatch }>,
) {
  const fieldsById = new Map(updates.map((item) => [item.id, cacheFieldsFromPatch(item.patch)]));
  queryClient.setQueriesData<CallbackRequestWithRelations[]>(
    { queryKey: CALLBACK_REQUESTS_KEY },
    (old) =>
      old?.map((request) => {
        const fields = fieldsById.get(request.id);
        if (!fields) return request;
        const next = { ...request, ...fields };
        if (fields.assigned_counsellor !== undefined) {
          next.counsellor =
            fields.assigned_counsellor === request.counsellor?.id ? request.counsellor : null;
        }
        return next;
      }),
  );
}

function restoreCachedRequests(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: CachedLists,
) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

function invalidateAfterUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  leadIds: string[],
) {
  queryClient.invalidateQueries({ queryKey: CALLBACK_REQUESTS_KEY });
  queryClient.invalidateQueries({ queryKey: ["leads"] });
  for (const leadId of new Set(leadIds)) {
    queryClient.invalidateQueries({ queryKey: ["leads", leadId, "activities"] });
  }
}

/** Full save used by the request card, where several fields change at once. */
export function useUpdateCallbackRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CallbackRequestUpdateInput) =>
      applyCallbackRequestUpdate(createClient(), input),
    onSuccess: (_, variables) => {
      toast.success("Request updated");
      invalidateAfterUpdate(queryClient, [variables.leadId]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

type PatchVariables = {
  request: PatchableCallbackRequest;
  patch: CallbackRequestPatch;
  message?: string;
  undoable?: boolean;
};

/**
 * Instant single-field edits: optimistic, with an Undo action in the toast.
 * Used by the inline counsellor/status controls in the agenda and cards.
 */
export function useCallbackRequestPatch() {
  const queryClient = useQueryClient();
  const mutationRef = React.useRef<{ mutate: (variables: PatchVariables) => void } | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ request, patch }: PatchVariables) =>
      applyCallbackRequestUpdate(createClient(), mergePatch(request, patch)),
    onMutate: async ({ request, patch }: PatchVariables) => {
      await queryClient.cancelQueries({ queryKey: CALLBACK_REQUESTS_KEY });
      const snapshot = queryClient.getQueriesData<CallbackRequestWithRelations[]>({
        queryKey: CALLBACK_REQUESTS_KEY,
      }) as CachedLists;
      patchCachedRequests(queryClient, [{ id: request.id, patch }]);
      return { snapshot };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.snapshot) restoreCachedRequests(queryClient, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: (_data, { request, patch, message, undoable = true }: PatchVariables) => {
      const undo = inversePatch(request, patch);
      toast.success(message ?? "Request updated", {
        action: undoable
          ? {
              label: "Undo",
              onClick: () =>
                mutationRef.current?.mutate({
                  request: { ...request, ...cacheFieldsFromPatch(patch) },
                  patch: undo,
                  message: "Change reverted",
                  undoable: false,
                }),
            }
          : undefined,
      });
    },
    onSettled: (_data, _error, { request }: PatchVariables) => {
      invalidateAfterUpdate(queryClient, [request.lead_id]);
    },
  });

  mutationRef.current = mutation;
  return mutation;
}

type BulkVariables = {
  updates: Array<{ request: PatchableCallbackRequest; patch: CallbackRequestPatch }>;
  message?: string;
  undoable?: boolean;
};

/** Applies the same change to a selection of requests, with a symmetric Undo. */
export function useBulkUpdateCallbackRequests() {
  const queryClient = useQueryClient();
  const mutationRef = React.useRef<{ mutate: (variables: BulkVariables) => void } | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ updates }: BulkVariables) => {
      const supabase = createClient();
      for (const { request, patch } of updates) {
        await applyCallbackRequestUpdate(supabase, mergePatch(request, patch));
      }
    },
    onMutate: async ({ updates }: BulkVariables) => {
      await queryClient.cancelQueries({ queryKey: CALLBACK_REQUESTS_KEY });
      const snapshot = queryClient.getQueriesData<CallbackRequestWithRelations[]>({
        queryKey: CALLBACK_REQUESTS_KEY,
      }) as CachedLists;
      patchCachedRequests(
        queryClient,
        updates.map(({ request, patch }) => ({ id: request.id, patch })),
      );
      return { snapshot };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.snapshot) restoreCachedRequests(queryClient, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: (_data, { updates, message, undoable = true }: BulkVariables) => {
      toast.success(message ?? `${updates.length} request${updates.length === 1 ? "" : "s"} updated`, {
        action: undoable
          ? {
              label: "Undo",
              onClick: () =>
                mutationRef.current?.mutate({
                  updates: updates.map(({ request, patch }) => ({
                    request: { ...request, ...cacheFieldsFromPatch(patch) },
                    patch: inversePatch(request, patch),
                  })),
                  message: "Changes reverted",
                  undoable: false,
                }),
            }
          : undefined,
      });
    },
    onSettled: (_data, _error, { updates }: BulkVariables) => {
      invalidateAfterUpdate(
        queryClient,
        updates.map(({ request }) => request.lead_id),
      );
    },
  });

  mutationRef.current = mutation;
  return mutation;
}
