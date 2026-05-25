"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type {
  FollowUp,
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
} from "@/lib/types";

const FOLLOW_UPS_KEY = ["follow_ups"] as const;

export type FollowUpWithRelations = FollowUp & {
  lead: {
    id: string;
    full_name: string;
    phone: string;
    status: string;
    lead_score: number;
    assigned_counsellor: string | null;
  } | null;
  assignee: { id: string; full_name: string | null; email: string } | null;
};

export function useFollowUps(opts?: {
  status?: FollowUpStatus | "all";
  leadId?: string;
  assignedTo?: string;
  upcomingOnly?: boolean;
  fromDate?: string;
  toDate?: string;
}) {
  return useQuery({
    queryKey: [...FOLLOW_UPS_KEY, opts],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from("follow_ups")
        .select(
          "*, lead:leads(id,full_name,phone,status,lead_score,assigned_counsellor), assignee:profiles!follow_ups_assigned_user_id_fkey(id,full_name,email)",
        )
        .order("due_date", { ascending: true })
        .order("due_time", { ascending: true });
      if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
      if (opts?.leadId) q = q.eq("lead_id", opts.leadId);
      if (opts?.assignedTo) q = q.eq("assigned_user_id", opts.assignedTo);
      if (opts?.upcomingOnly) {
        q = q.gte("scheduled_at", new Date().toISOString());
      }
      if (opts?.fromDate) q = q.gte("due_date", opts.fromDate);
      if (opts?.toDate) q = q.lte("due_date", opts.toDate);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as FollowUpWithRelations[];
    },
  });
}

export type FollowUpInput = {
  id?: string;
  lead_id: string;
  assigned_user_id?: string | null;
  followup_type: FollowUpType;
  due_date: string;
  due_time: string;
  priority?: FollowUpPriority;
  status?: FollowUpStatus;
  remarks?: string | null;
};

function scheduledAtFromTask(input: Pick<FollowUpInput, "due_date" | "due_time">) {
  return new Date(`${input.due_date}T${input.due_time}`).toISOString();
}

export function useUpsertFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FollowUpInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload = {
        ...input,
        assigned_to: input.assigned_user_id ?? null,
        type: input.followup_type,
        scheduled_at: scheduledAtFromTask(input),
        notes: input.remarks ?? null,
        created_by: user?.id ?? null,
      };
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
          title: `Follow-up scheduled (${input.followup_type})`,
          description: input.remarks ?? null,
          metadata: { due_date: input.due_date, due_time: input.due_time },
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

export type CompleteFollowUpInput = {
  id: string;
  remarks: string;
  next_followup_type?: FollowUpType;
  next_due_date?: string | null;
  next_due_time?: string | null;
  next_priority?: FollowUpPriority;
  next_assigned_user_id?: string | null;
  next_remarks?: string | null;
};

export function useCompleteFollowUpTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteFollowUpInput) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("complete_follow_up_task", {
        p_task_id: input.id,
        p_remarks: input.remarks,
        p_next_followup_type: input.next_followup_type ?? "call",
        p_next_due_date: input.next_due_date ?? null,
        p_next_due_time: input.next_due_time ?? null,
        p_next_priority: input.next_priority ?? "normal",
        p_next_assigned_user_id: input.next_assigned_user_id ?? null,
        p_next_remarks: input.next_remarks ?? null,
      });
      if (error) throw new Error(error.message);
      return data as FollowUp;
    },
    onSuccess: (task) => {
      toast.success("Follow-up completed");
      qc.invalidateQueries({ queryKey: FOLLOW_UPS_KEY });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads", task.lead_id, "activities"] });
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
