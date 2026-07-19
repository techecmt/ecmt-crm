"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { ADMISSION_GOALS_KEY } from "@/lib/hooks/use-admission-goals";
import { shouldClearPendingFollowUps } from "@/lib/lead-pipeline";
import type { DuplicateCheckLead } from "@/lib/lead-duplicates";
import type {
  AdmissionStage,
  CounsellingChecks,
  FollowUpPriority,
  FollowUpStatus,
  HighestQualification,
  Lead,
  LeadActivity,
  LeadSource,
  LeadStatus,
  NotInterestedReason,
} from "@/lib/types";
import { PIPELINE_LEAD_STATUSES } from "@/lib/types";

const LEADS_KEY = ["leads"] as const;

/** Sentinel used inside counsellorIds to match leads with no assigned counsellor. */
export const UNASSIGNED_COUNSELLOR = "unassigned";

/** PostgREST returns at most this many rows per request unless paginated. */
export const LEADS_FETCH_BATCH_SIZE = 1000;

export type LeadFilters = {
  search?: string;
  status?: LeadStatus | "all";
  source?: LeadSource | "all";
  collegeId?: string | "all";
  /** Exact-match on interested_course. "all" or undefined = no filter. */
  course?: string | "all";
  /** Single-value fallback — prefer counsellorIds for multi-select. */
  counsellorId?: string | "all";
  /** Multi-select: empty array or undefined means all counsellors. */
  counsellorIds?: string[];
  enabled?: boolean;
};

export type LeadWithRelations = Lead & {
  college: { id: string; name: string } | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
  follow_ups: { status: FollowUpStatus; scheduled_at: string }[] | null;
};

const LEADS_SELECT =
  "*, college:colleges(id,name), counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email), follow_ups(status, scheduled_at)";

export type LeadSortKey = "created_at" | "full_name" | "lead_score" | "status" | "source";
export type LeadSortDir = "asc" | "desc";

export type LeadsPaginatedParams = LeadFilters & {
  page: number;
  pageSize: number;
  sortKey?: LeadSortKey;
  sortDir?: LeadSortDir;
};

export type LeadsPaginatedResult = {
  leads: LeadWithRelations[];
  totalCount: number;
};

type LeadStatusRow = { status: LeadStatus };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLeadFilters(query: any, filters: LeadFilters) {
  let q = query;

  if (filters.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }
  if (filters.source && filters.source !== "all") {
    q = q.eq("source", filters.source);
  }
  if (filters.collegeId && filters.collegeId !== "all") {
    q = q.eq("college_id", filters.collegeId);
  }
  if (filters.course && filters.course !== "all") {
    q = q.eq("interested_course", filters.course);
  }
  if (filters.counsellorIds && filters.counsellorIds.length > 0) {
    const includeUnassigned = filters.counsellorIds.includes(UNASSIGNED_COUNSELLOR);
    const realIds = filters.counsellorIds.filter((id) => id !== UNASSIGNED_COUNSELLOR);
    if (includeUnassigned && realIds.length > 0) {
      q = q.or(
        `assigned_counsellor.in.(${realIds.join(",")}),assigned_counsellor.is.null`,
      );
    } else if (includeUnassigned) {
      q = q.is("assigned_counsellor", null);
    } else {
      q = q.in("assigned_counsellor", realIds);
    }
  } else if (filters.counsellorId && filters.counsellorId !== "all") {
    q = q.eq("assigned_counsellor", filters.counsellorId);
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[\\"]/g, (match) => `\\${match}`);
    const term = `"%${escaped}%"`;
    q = q.or(
      `full_name.ilike.${term},phone.ilike.${term},email.ilike.${term},city.ilike.${term},interested_course.ilike.${term}`,
    );
  }

  return q;
}

type FetchLeadBatchOptions = {
  from: number;
  to: number;
  sortKey?: LeadSortKey;
  sortDir?: LeadSortDir;
  select?: string;
  count?: boolean;
};

async function fetchLeadBatch(
  filters: LeadFilters,
  options: FetchLeadBatchOptions,
): Promise<{ data: LeadWithRelations[]; count: number | null }> {
  const supabase = createClient();
  const sortKey = options.sortKey ?? "created_at";
  const sortDir = options.sortDir ?? "desc";

  let q = supabase
    .from("leads")
    .select(
      options.select ?? LEADS_SELECT,
      options.count ? { count: "exact" } : undefined,
    );
  q = applyLeadFilters(q, filters);
  q = q.order(sortKey, { ascending: sortDir === "asc" });
  if (sortKey !== "created_at") {
    q = q.order("created_at", { ascending: false });
  }
  q = q.range(options.from, options.to);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    data: (data ?? []) as unknown as LeadWithRelations[],
    count: count ?? null,
  };
}

/** Fetch every lead matching filters, paging past the PostgREST 1,000-row cap. */
export async function fetchAllLeads(filters: LeadFilters = {}): Promise<LeadWithRelations[]> {
  const all: LeadWithRelations[] = [];
  let from = 0;

  while (true) {
    const { data } = await fetchLeadBatch(filters, {
      from,
      to: from + LEADS_FETCH_BATCH_SIZE - 1,
    });
    all.push(...data);
    if (data.length < LEADS_FETCH_BATCH_SIZE) break;
    from += LEADS_FETCH_BATCH_SIZE;
  }

  return all;
}

async function fetchLeadStatusRows(filters: LeadFilters): Promise<LeadStatusRow[]> {
  const all: LeadStatusRow[] = [];
  let from = 0;

  while (true) {
    const supabase = createClient();
    let q = supabase.from("leads").select("status");
    q = applyLeadFilters(q, { ...filters, status: "all" });
    q = q.order("created_at", { ascending: false });
    q = q.range(from, from + LEADS_FETCH_BATCH_SIZE - 1);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as LeadStatusRow[];
    all.push(...rows);
    if (rows.length < LEADS_FETCH_BATCH_SIZE) break;
    from += LEADS_FETCH_BATCH_SIZE;
  }

  return all;
}

export function useLeads(filters: LeadFilters = {}) {
  const { enabled = true, ...queryFilters } = filters;
  return useQuery({
    enabled,
    queryKey: [...LEADS_KEY, queryFilters],
    staleTime: 2 * 60 * 1000, // 2 min — leads don't change mid-session
    queryFn: () => fetchAllLeads(queryFilters),
  });
}

export function useLeadsPaginated(params: LeadsPaginatedParams) {
  const {
    enabled = true,
    page,
    pageSize,
    sortKey = "created_at",
    sortDir = "desc",
    ...queryFilters
  } = params;

  return useQuery({
    enabled,
    queryKey: [...LEADS_KEY, "paginated", { page, pageSize, sortKey, sortDir, ...queryFilters }],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<LeadsPaginatedResult> => {
      const from = (page - 1) * pageSize;
      const { data, count } = await fetchLeadBatch(queryFilters, {
        from,
        to: from + pageSize - 1,
        sortKey,
        sortDir,
        count: true,
      });
      return { leads: data, totalCount: count ?? data.length };
    },
  });
}

export function useLeadsStatusCounts(filters: LeadFilters = {}) {
  const { enabled = true, ...queryFilters } = filters;

  return useQuery({
    enabled,
    queryKey: [...LEADS_KEY, "status-counts", queryFilters],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const rows = await fetchLeadStatusRows(queryFilters);
      const counts = Object.fromEntries(
        PIPELINE_LEAD_STATUSES.map((status) => [status, 0]),
      ) as Record<LeadStatus, number>;

      for (const row of rows) {
        if (row.status in counts) {
          counts[row.status] += 1;
        }
      }

      return counts;
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [...LEADS_KEY, id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("leads")
        .select(
          "*, college:colleges(id,name), counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email), follow_ups(status)",
        )
        .eq("id", id!)
        .single();
      if (error) throw new Error(error.message);
      return data as LeadWithRelations;
    },
  });
}

export function useLeadDuplicateCandidates({
  phone,
  collegeId,
  course,
  excludeLeadId,
}: {
  phone?: string;
  collegeId?: string | null;
  course?: string | null;
  excludeLeadId?: string | null;
}) {
  return useQuery({
    enabled: !!phone?.trim(),
    queryKey: [
      ...LEADS_KEY,
      "duplicate-candidates",
      phone?.trim() ?? "",
      collegeId ?? null,
      course ?? null,
      excludeLeadId ?? null,
    ],
    queryFn: async () => {
      if (!phone?.trim()) return [] as DuplicateCheckLead[];
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_lead_duplicate_matches", {
        p_phone: phone,
        p_college_id: collegeId ?? null,
        p_interested_course: course ?? null,
        p_exclude_lead_id: excludeLeadId ?? null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as DuplicateCheckLead[];
    },
  });
}

export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    enabled: !!leadId,
    queryKey: [...LEADS_KEY, leadId, "activities"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*, user:profiles(id,full_name,email)")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as (LeadActivity & {
        user: { id: string; full_name: string | null; email: string } | null;
      })[];
    },
  });
}

export type LeadUpsertInput = {
  id?: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  city?: string | null;
  nationality?: string | null;
  nationality_other?: string | null;
  highest_qualification?: HighestQualification | null;
  highest_qualification_other?: string | null;
  interested_course?: string | null;
  college_id?: string | null;
  source?: LeadSource;
  status?: LeadStatus;
  admission_stage?: AdmissionStage | null;
  assigned_counsellor?: string | null;
  description?: string | null;
  follow_up_date?: string | null;
  lead_score?: number;
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  initial_follow_up_priority?: FollowUpPriority;
  initial_follow_up_remarks?: string | null;
};

export function useUpsertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadUpsertInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const {
        initial_follow_up_priority,
        initial_follow_up_remarks,
        ...leadInput
      } = input;
      const payload = { ...leadInput, created_by: user?.id ?? null };
      if (input.id) {
        const { data, error } = await supabase
          .from("leads")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        if (initial_follow_up_priority || initial_follow_up_remarks) {
          await supabase
            .from("follow_ups")
            .update({
              priority: initial_follow_up_priority ?? "normal",
              remarks: initial_follow_up_remarks ?? null,
              notes: initial_follow_up_remarks ?? null,
            })
            .eq("lead_id", input.id)
            .eq("status", "pending");
        }
        return data as Lead;
      }
      const { data, error } = await supabase
        .from("leads")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      if (initial_follow_up_priority || initial_follow_up_remarks) {
        await supabase
          .from("follow_ups")
          .update({
            priority: initial_follow_up_priority ?? "normal",
            remarks: initial_follow_up_remarks ?? null,
            notes: initial_follow_up_remarks ?? null,
          })
          .eq("lead_id", data.id)
          .eq("status", "pending");
      }
      // Log activity
      if (user) {
        await supabase.from("lead_activities").insert({
          lead_id: data.id,
          user_id: user.id,
          type: "system",
          title: "Lead created",
        });
        await supabase.from("user_audit_events").insert({
          user_id: user.id,
          event_type: "lead_created",
          lead_id: data.id,
          metadata: {
            college_id: data.college_id,
            interested_course: data.interested_course,
          },
        });
      }
      return data as Lead;
    },
    onSuccess: () => {
      toast.success("Lead saved");
      qc.invalidateQueries({ queryKey: LEADS_KEY });
      qc.invalidateQueries({ queryKey: ["follow_ups"] });
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export type UpdateLeadStatusInput = {
  id: string;
  status: LeadStatus;
  /** Optional counsellor override when (re)seeding follow-ups. */
  assigned_user_id?: string | null;
  /** Required when marking lead as inactive courses. */
  notes?: string;
  /** Required when moving to registration_unpaid or registered_paid_reg_fee. */
  registration_completed_at?: string | null;
};

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      assigned_user_id,
      notes,
      registration_completed_at,
    }: UpdateLeadStatusInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const trimmedNotes = notes?.trim() ?? "";
      if (status === "course_not_started" && !trimmedNotes) {
        throw new Error("Notes are required when marking a lead Inactive Courses.");
      }
      const isRegistration =
        status === "registration_unpaid" || status === "registered_paid_reg_fee";
      if (isRegistration && !registration_completed_at) {
        throw new Error("Registration completed date is required.");
      }
      const { data: currentLead, error: currentLeadError } = await supabase
        .from("leads")
        .select("status")
        .eq("id", id)
        .single();
      if (currentLeadError) throw new Error(currentLeadError.message);
      const updates: Record<string, unknown> = { status };
      if (status === "counselling_in_progress" && assigned_user_id) {
        updates.assigned_counsellor = assigned_user_id;
      }
      if (isRegistration && registration_completed_at) {
        updates.registration_completed_at = registration_completed_at;
      }
      const { data, error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      if (
        status === "counselling_in_progress" &&
        currentLead?.status === "inquiry_received"
      ) {
        const { error: seedError } = await supabase.rpc(
          "start_counselling_follow_ups",
          {
            p_lead_id: id,
            p_assigned_user_id: assigned_user_id ?? data.assigned_counsellor ?? null,
            p_first_at: new Date().toISOString(),
          },
        );
        if (seedError) throw new Error(seedError.message);
      } else if (shouldClearPendingFollowUps(status)) {
        const { error: clearError } = await supabase.rpc(
          "clear_pending_follow_ups",
          { p_lead_id: id },
        );
        if (clearError) throw new Error(clearError.message);
      }

      if (user) {
        await supabase.from("lead_activities").insert({
          lead_id: id,
          user_id: user.id,
          type: "status_change",
          title: `Status changed to ${status}`,
          description: trimmedNotes || null,
        });
        if (
          status === "counselling_in_progress" &&
          currentLead?.status === "inquiry_received"
        ) {
          await supabase.from("user_audit_events").insert({
            user_id: user.id,
            event_type: "counselling_started",
            lead_id: id,
          });
        }
        if (status === "registration_unpaid" || status === "registered_paid_reg_fee") {
          await supabase.from("user_audit_events").insert({
            user_id: user.id,
            event_type: "registration",
            lead_id: id,
            metadata: { registration_status: status },
          });
        }
      }
      return data as Lead;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: LEADS_KEY });
      qc.invalidateQueries({ queryKey: ["follow_ups"] });
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export type CompleteCounsellingInput = {
  id: string;
  first_name: string;
  last_name?: string | null;
  phone: string;
  nationality: string;
  nationality_other?: string | null;
  highest_qualification: HighestQualification;
  highest_qualification_other?: string | null;
  college_id: string;
  interested_course: string;
  counselling_checks: CounsellingChecks;
};

export function useCompleteCounselling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteCounsellingInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const trimmedLast = input.last_name?.trim() ?? "";
      const full_name = trimmedLast
        ? `${input.first_name.trim()} ${trimmedLast}`
        : input.first_name.trim();
      const { data, error } = await supabase
        .from("leads")
        .update({
          status: "counselling_completed",
          first_name: input.first_name.trim(),
          last_name: trimmedLast || null,
          full_name,
          phone: input.phone.trim(),
          nationality: input.nationality.trim(),
          nationality_other:
            input.nationality === "Other"
              ? input.nationality_other?.trim() || null
              : null,
          highest_qualification: input.highest_qualification,
          highest_qualification_other:
            input.highest_qualification === "other"
              ? input.highest_qualification_other?.trim() || null
              : null,
          college_id: input.college_id,
          interested_course: input.interested_course,
          counselling_checks: input.counselling_checks,
          counselling_completed_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const assigneeId = data.assigned_counsellor ?? user?.id ?? null;

      // Anchor post-counselling follow-ups after the latest pending follow-up
      // so they never land before already-scheduled in-progress ones.
      const { data: pendingFollowUps } = await supabase
        .from("follow_ups")
        .select("scheduled_at")
        .eq("lead_id", input.id)
        .eq("status", "pending")
        .order("scheduled_at", { ascending: false })
        .limit(1);
      const latestPending = pendingFollowUps?.[0]?.scheduled_at;
      const anchor = latestPending
        ? new Date(latestPending).toISOString()
        : new Date().toISOString();

      const { error: seedError } = await supabase.rpc(
        "start_counselling_follow_ups",
        {
          p_lead_id: input.id,
          p_assigned_user_id: assigneeId,
          p_first_at: anchor,
        },
      );
      if (seedError) throw new Error(seedError.message);

      if (user) {
        await supabase.from("lead_activities").insert({
          lead_id: input.id,
          user_id: user.id,
          type: "status_change",
          title: "Counselling completed",
          description: "Counsellor confirmed all mandatory counselling checks.",
          metadata: { counselling_checks: input.counselling_checks },
        });
        await supabase.from("user_audit_events").insert({
          user_id: user.id,
          event_type: "counselling_completed",
          lead_id: input.id,
        });
      }
      return data as Lead;
    },
    onSuccess: () => {
      toast.success("Counselling completed");
      qc.invalidateQueries({ queryKey: LEADS_KEY });
      qc.invalidateQueries({ queryKey: ["follow_ups"] });
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export type MarkNotInterestedInput = {
  id: string;
  reason: NotInterestedReason;
  notes: string;
};

export function useMarkNotInterested() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason, notes }: MarkNotInterestedInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const trimmedNotes = notes.trim();
      if (!trimmedNotes) {
        throw new Error("Notes are required when marking a lead Not Interested.");
      }
      const { data, error } = await supabase
        .from("leads")
        .update({
          status: "not_interested",
          not_interested_reason: reason,
          not_interested_notes: trimmedNotes,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const { error: clearError } = await supabase.rpc(
        "clear_pending_follow_ups",
        { p_lead_id: id },
      );
      if (clearError) throw new Error(clearError.message);

      if (user) {
        await supabase.from("lead_activities").insert({
          lead_id: id,
          user_id: user.id,
          type: "status_change",
          title: "Marked Not Interested",
          description: trimmedNotes,
          metadata: { reason },
        });
      }
      return data as Lead;
    },
    onSuccess: () => {
      toast.success("Lead marked Not Interested");
      qc.invalidateQueries({ queryKey: LEADS_KEY });
      qc.invalidateQueries({ queryKey: ["follow_ups"] });
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lead deleted");
      qc.invalidateQueries({ queryKey: LEADS_KEY });
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBulkUpdateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      status,
      assignedCounsellor,
    }: {
      ids: string[];
      status?: LeadStatus;
      assignedCounsellor?: string | "unassigned";
    }) => {
      if (!ids.length) return;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const updates: Record<string, unknown> = {};
      if (status) {
        updates.status = status;
      }
      if (assignedCounsellor !== undefined) {
        updates.assigned_counsellor =
          assignedCounsellor === "unassigned" ? null : assignedCounsellor;
      }

      if (Object.keys(updates).length === 0) return;
      if (status === "course_not_started") {
        throw new Error(
          "Bulk update to Inactive Courses is disabled because notes are mandatory. Update leads individually.",
        );
      }
      if (status === "registration_unpaid" || status === "registered_paid_reg_fee") {
        throw new Error(
          "Bulk update to registration statuses is disabled because a registration date is mandatory. Update leads individually.",
        );
      }

      const { error } = await supabase.from("leads").update(updates).in("id", ids);
      if (error) throw new Error(error.message);

      if (status && shouldClearPendingFollowUps(status)) {
        const { error: clearError } = await supabase
          .from("follow_ups")
          .delete()
          .in("lead_id", ids)
          .eq("status", "pending");
        if (clearError) throw new Error(clearError.message);
      }

      if (user && status) {
        await supabase.from("lead_activities").insert(
          ids.map((leadId) => ({
            lead_id: leadId,
            user_id: user.id,
            type: "status_change",
            title: `Status changed to ${status} (bulk)`,
          })),
        );
      }
    },
    onSuccess: () => {
      toast.success("Leads updated");
      qc.invalidateQueries({ queryKey: LEADS_KEY });
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      title,
      description,
      status,
    }: {
      leadId: string;
      title: string;
      description?: string | null;
      status?: LeadStatus;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("lead_activities").insert({
        lead_id: leadId,
        user_id: user?.id ?? null,
        type: "note",
        title,
        description: description ?? null,
        metadata: status ? { status_at_note: status } : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, vars) => {
      toast.success("Note added");
      qc.invalidateQueries({ queryKey: [...LEADS_KEY, vars.leadId, "activities"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
