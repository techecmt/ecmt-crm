"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { FollowUp, FollowUpStatus, FollowUpType } from "@/lib/types";

const FOLLOW_UPS_KEY = ["follow_ups"] as const;

export type FollowUpWithRelations = FollowUp & {
  lead: { id: string; full_name: string; phone: string } | null;
  assignee: { id: string; full_name: string | null; email: string } | null;
};

export function useFollowUps(opts?: {
  status?: FollowUpStatus | "all";
  leadId?: string;
  assignedTo?: string;
  upcomingOnly?: boolean;
}) {
  return useQuery({
    queryKey: [...FOLLOW_UPS_KEY, opts],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from("follow_ups")
        .select(
          "*, lead:leads(id,full_name,phone), assignee:profiles!follow_ups_assigned_to_fkey(id,full_name,email)",
        )
        .order("scheduled_at", { ascending: true });
      if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
      if (opts?.leadId) q = q.eq("lead_id", opts.leadId);
      if (opts?.assignedTo) q = q.eq("assigned_to", opts.assignedTo);
      if (opts?.upcomingOnly) {
        q = q.gte("scheduled_at", new Date().toISOString());
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as FollowUpWithRelations[];
    },
  });
}

export type FollowUpInput = {
  id?: string;
  lead_id: string;
  assigned_to?: string | null;
  type: FollowUpType;
  status?: FollowUpStatus;
  scheduled_at: string;
  notes?: string | null;
  outcome?: string | null;
};

export function useUpsertFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FollowUpInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload = { ...input, created_by: user?.id ?? null };
      if (input.id) {
        const { data, error } = await supabase
          .from("follow_ups")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        return data as FollowUp;
      }
      const { data, error } = await supabase
        .from("follow_ups")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      if (user) {
        await supabase.from("lead_activities").insert({
          lead_id: input.lead_id,
          user_id: user.id,
          type: "follow_up",
          title: `Follow-up scheduled (${input.type})`,
          description: input.notes ?? null,
          metadata: { scheduled_at: input.scheduled_at },
        });
      }
      return data as FollowUp;
    },
    onSuccess: (_, vars) => {
      toast.success("Follow-up saved");
      qc.invalidateQueries({ queryKey: FOLLOW_UPS_KEY });
      qc.invalidateQueries({
        queryKey: ["leads", vars.lead_id, "activities"],
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateFollowUpStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      outcome,
    }: {
      id: string;
      status: FollowUpStatus;
      outcome?: string | null;
    }) => {
      const supabase = createClient();
      const updates: Record<string, unknown> = { status };
      if (status === "completed") updates.completed_at = new Date().toISOString();
      if (outcome !== undefined) updates.outcome = outcome;
      const { data, error } = await supabase
        .from("follow_ups")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as FollowUp;
    },
    onSuccess: () => {
      toast.success("Follow-up updated");
      qc.invalidateQueries({ queryKey: FOLLOW_UPS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("follow_ups").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Follow-up deleted");
      qc.invalidateQueries({ queryKey: FOLLOW_UPS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
