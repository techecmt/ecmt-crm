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
    college_id: string | null;
    college: { id: string; name: string } | null;
  } | null;
  assignee: { id: string; full_name: string | null; email: string } | null;
};

export type FollowUpsQueryOpts = {
  status?: FollowUpStatus | "all";
  leadId?: string;
  /** Filter by a specific assignee. Use "me" to filter to the current user. */
  assignedTo?: string | "me";
  collegeId?: string;
  upcomingOnly?: boolean;
  fromDate?: string;
  toDate?: string;
  enabled?: boolean;
};

export function useFollowUps(opts: FollowUpsQueryOpts = {}) {
  return useQuery({
    enabled: opts.enabled ?? true,
    queryKey: [...FOLLOW_UPS_KEY, opts],
    queryFn: async () => {
      const supabase = createClient();
      let assignedToId: string | undefined;
      if (opts.assignedTo === "me") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];
        assignedToId = user.id;
      } else if (opts.assignedTo) {
        assignedToId = opts.assignedTo;
      }
      const leadSelect = opts.collegeId
        ? "lead:leads!inner(id,full_name,phone,status,lead_score,assigned_counsellor,college_id,college:colleges(id,name))"
        : "lead:leads(id,full_name,phone,status,lead_score,assigned_counsellor,college_id,college:colleges(id,name))";
      let q = supabase
        .from("follow_ups")
        .select(
          `*, ${leadSelect}, assignee:profiles!follow_ups_assigned_user_id_fkey(id,full_name,email)`,
        )
        .order("due_date", { ascending: true })
        .order("due_time", { ascending: true });
      if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
      if (opts.leadId) q = q.eq("lead_id", opts.leadId);
      if (assignedToId) q = q.eq("assigned_user_id", assignedToId);
      if (opts.collegeId) q = q.eq("lead.college_id", opts.collegeId);
      if (opts.upcomingOnly) {
        q = q.gte("scheduled_at", new Date().toISOString());
      }
      if (opts.fromDate) q = q.gte("due_date", opts.fromDate);
      if (opts.toDate) q = q.lte("due_date", opts.toDate);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as FollowUpWithRelations[];
    },
  });
}

/**
 * Keep only the next upcoming pending follow-up per lead. All other pending
 * follow-ups for the same lead are hidden from view until the current one
 * is completed. Completed follow-ups are surfaced separately.
 */
export function nextUpcomingPerLead(
  followUps: FollowUpWithRelations[],
): FollowUpWithRelations[] {
  const grouped = new Map<string, FollowUpWithRelations>();
  for (const f of followUps) {
    if (f.status !== "pending") continue;
    const existing = grouped.get(f.lead_id);
    if (!existing) {
      grouped.set(f.lead_id, f);
      continue;
    }
    const a = new Date(existing.scheduled_at).getTime();
    const b = new Date(f.scheduled_at).getTime();
    if (b < a) grouped.set(f.lead_id, f);
  }
  return Array.from(grouped.values()).sort(
    (a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
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
};

export function useCompleteFollowUpTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteFollowUpInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("follow_ups")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          remarks: input.remarks,
          notes: input.remarks,
          outcome: input.remarks,
        })
        .eq("id", input.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);

      if (user && data?.lead_id) {
        await supabase.from("lead_activities").insert({
          lead_id: data.lead_id,
          user_id: user.id,
          type: "follow_up",
          title: "Follow-up completed",
          description: input.remarks,
        });
        await supabase.from("user_audit_events").insert({
          user_id: user.id,
          event_type: "follow_up_completed",
          lead_id: data.lead_id,
        });
      }

      return data as FollowUp;
    },
    onSuccess: (task) => {
      toast.success("Follow-up completed");
      qc.invalidateQueries({ queryKey: FOLLOW_UPS_KEY });
      qc.invalidateQueries({ queryKey: ["leads"] });
      if (task?.lead_id) {
        qc.invalidateQueries({ queryKey: ["leads", task.lead_id, "activities"] });
      }
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
