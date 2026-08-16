"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { CallbackRequest, CallbackRequestStatus } from "@/lib/types";

export const CALLBACK_REQUESTS_KEY = ["callback_requests"] as const;

export type CallbackRequestWithRelations = CallbackRequest & {
  lead: { id: string; full_name: string } | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

export type CallbackRequestFilters = {
  leadId?: string;
  status?: CallbackRequestStatus | "all";
};

const CALLBACK_REQUESTS_SELECT =
  "*, lead:leads(id,full_name), counsellor:profiles!callback_requests_assigned_counsellor_fkey(id,full_name,email)";

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

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CallbackRequestWithRelations[];
    },
  });
}

export function useUpdateCallbackRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      leadId,
      status,
      assignedCounsellor,
      notes,
    }: {
      id: string;
      leadId: string;
      status: CallbackRequestStatus;
      assignedCounsellor: string | null;
      notes: string | null;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("callback_requests")
        .update({
          status,
          assigned_counsellor: assignedCounsellor,
          notes: notes?.trim() || null,
        })
        .eq("id", id);
      if (error) throw new Error(error.message);

      const { error: activityError } = await supabase.from("lead_activities").insert({
        lead_id: leadId,
        user_id: user?.id ?? null,
        type: "system",
        title: `Callback request marked ${status}`,
        description: notes?.trim() || null,
        metadata: { callback_request_id: id, callback_status: status },
      });
      if (activityError) throw new Error(activityError.message);
    },
    onSuccess: (_, variables) => {
      toast.success("Callback request updated");
      queryClient.invalidateQueries({ queryKey: CALLBACK_REQUESTS_KEY });
      queryClient.invalidateQueries({
        queryKey: ["leads", variables.leadId, "activities"],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
