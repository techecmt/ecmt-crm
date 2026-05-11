"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type {
  AdmissionStage,
  Lead,
  LeadActivity,
  LeadSource,
  LeadStatus,
} from "@/lib/types";

const LEADS_KEY = ["leads"] as const;

export type LeadFilters = {
  search?: string;
  status?: LeadStatus | "all";
  source?: LeadSource | "all";
  collegeId?: string | "all";
  counsellorId?: string | "all";
};

export type LeadWithRelations = Lead & {
  college: { id: string; name: string } | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

export function useLeads(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: [...LEADS_KEY, filters],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from("leads")
        .select(
          "*, college:colleges(id,name), counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email)",
        )
        .order("created_at", { ascending: false });

      if (filters.status && filters.status !== "all") {
        q = q.eq("status", filters.status);
      }
      if (filters.source && filters.source !== "all") {
        q = q.eq("source", filters.source);
      }
      if (filters.collegeId && filters.collegeId !== "all") {
        q = q.eq("college_id", filters.collegeId);
      }
      if (filters.counsellorId && filters.counsellorId !== "all") {
        q = q.eq("assigned_counsellor", filters.counsellorId);
      }
      if (filters.search) {
        const term = `%${filters.search}%`;
        q = q.or(
          `full_name.ilike.${term},phone.ilike.${term},email.ilike.${term},city.ilike.${term},interested_course.ilike.${term}`,
        );
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as LeadWithRelations[];
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
          "*, college:colleges(id,name), counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email)",
        )
        .eq("id", id!)
        .single();
      if (error) throw new Error(error.message);
      return data as LeadWithRelations;
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
  phone: string;
  email?: string | null;
  city?: string | null;
  interested_course?: string | null;
  college_id?: string | null;
  source?: LeadSource;
  status?: LeadStatus;
  admission_stage?: AdmissionStage | null;
  assigned_counsellor?: string | null;
  notes?: string | null;
  follow_up_date?: string | null;
  lead_score?: number;
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

export function useUpsertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadUpsertInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload = { ...input, created_by: user?.id ?? null };
      if (input.id) {
        const { data, error } = await supabase
          .from("leads")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        return data as Lead;
      }
      const { data, error } = await supabase
        .from("leads")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      // Log activity
      if (user) {
        await supabase.from("lead_activities").insert({
          lead_id: data.id,
          user_id: user.id,
          type: "system",
          title: "Lead created",
        });
      }
      return data as Lead;
    },
    onSuccess: () => {
      toast.success("Lead saved");
      qc.invalidateQueries({ queryKey: LEADS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: LeadStatus;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("leads")
        .update({ status })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      if (user) {
        await supabase.from("lead_activities").insert({
          lead_id: id,
          user_id: user.id,
          type: "status_change",
          title: `Status changed to ${status}`,
        });
      }
      return data as Lead;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: LEADS_KEY });
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
    }: {
      leadId: string;
      title: string;
      description?: string | null;
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
