"use client";

import { endOfMonth, startOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import type { College, LeadSource, LeadStatus, Profile } from "@/lib/types";

export type UserAuditFilters = {
  fromDate?: string;
  toDate?: string;
  month?: string;
  collegeId?: string;
  course?: string;
  source?: LeadSource;
  leadCreatedBy?: "system" | "users";
  counsellorId?: string;
};

type AuditEventType =
  | "lead_created"
  | "follow_up_completed"
  | "registration"
  | "counselling_completed"
  | "counselling_started";

export type UserAuditEventRow = {
  id: string;
  user_id: string | null;
  event_type: AuditEventType;
  created_at: string;
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
  user: { id: string; full_name: string | null; email: string } | null;
  lead: {
    id: string;
    college_id: string | null;
    interested_course: string | null;
    created_by: string | null;
  } | null;
};

export type CrmEntryRow = {
  id: string;
  user_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  user: { id: string; full_name: string | null; email: string } | null;
};

export type AdminReportLeadRow = {
  id: string;
  created_at: string;
  status: LeadStatus;
  registration_completed_at: string | null;
  college_id: string | null;
  interested_course: string | null;
  source: LeadSource;
  created_by: string | null;
  assigned_counsellor: string | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

type RelationMaybeArray<T> = T | T[] | null;

type RawUserAuditEventRow = Omit<UserAuditEventRow, "user" | "lead"> & {
  user: RelationMaybeArray<{ id: string; full_name: string | null; email: string }>;
  lead: RelationMaybeArray<{
    id: string;
    college_id: string | null;
    interested_course: string | null;
    created_by: string | null;
  }>;
};

type RawCrmEntryRow = Omit<CrmEntryRow, "user"> & {
  user: RelationMaybeArray<{ id: string; full_name: string | null; email: string }>;
};

type RawAdminReportLeadRow = Omit<AdminReportLeadRow, "counsellor"> & {
  counsellor: RelationMaybeArray<{ id: string; full_name: string | null; email: string }>;
};

function flattenRelation<T>(value: RelationMaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toIsoRangeStart(date?: string) {
  if (!date) return undefined;
  return `${date}T00:00:00.000Z`;
}

function toIsoRangeEnd(date?: string) {
  if (!date) return undefined;
  return `${date}T23:59:59.999Z`;
}

function parseMonthKey(month?: string) {
  const now = new Date();
  if (!month) return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [year, monthPart] = month.split("-").map(Number);
  if (!year || !monthPart || monthPart < 1 || monthPart > 12) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return new Date(Date.UTC(year, monthPart - 1, 1));
}

function normalizeCourse(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function useUserAuditReport(filters: UserAuditFilters) {
  return useQuery({
    queryKey: ["reports", "user-audit", filters],
    queryFn: async () => {
      const supabase = createClient();
      const fromIso = toIsoRangeStart(filters.fromDate);
      const toIso = toIsoRangeEnd(filters.toDate);
      const monthDate = parseMonthKey(filters.month);
      const monthStartIso = startOfMonth(monthDate).toISOString();
      const monthEndIso = endOfMonth(monthDate).toISOString();

      const coursesNeedle = normalizeCourse(filters.course);

      let eventsQuery = supabase
        .from("user_audit_events")
        .select(
          "id,user_id,event_type,created_at,lead_id,metadata,user:profiles(id,full_name,email),lead:leads(id,college_id,interested_course,created_by)",
        )
        .neq("event_type", "crm_entry")
        .order("created_at", { ascending: false });
      if (fromIso) eventsQuery = eventsQuery.gte("created_at", fromIso);
      if (toIso) eventsQuery = eventsQuery.lte("created_at", toIso);
      if (filters.counsellorId) eventsQuery = eventsQuery.eq("user_id", filters.counsellorId);

      let crmRangeQuery = supabase
        .from("user_audit_events")
        .select("id,user_id,created_at,metadata,user:profiles(id,full_name,email)")
        .eq("event_type", "crm_entry")
        .order("created_at", { ascending: false });
      if (fromIso) crmRangeQuery = crmRangeQuery.gte("created_at", fromIso);
      if (toIso) crmRangeQuery = crmRangeQuery.lte("created_at", toIso);
      if (filters.counsellorId) crmRangeQuery = crmRangeQuery.eq("user_id", filters.counsellorId);

      let crmMonthQuery = supabase
        .from("user_audit_events")
        .select("id,user_id,created_at,metadata,user:profiles(id,full_name,email)")
        .eq("event_type", "crm_entry")
        .gte("created_at", monthStartIso)
        .lte("created_at", monthEndIso)
        .order("created_at", { ascending: false });
      if (filters.counsellorId) crmMonthQuery = crmMonthQuery.eq("user_id", filters.counsellorId);

      let leadsQuery = supabase
        .from("leads")
        .select(
          "id,created_at,status,registration_completed_at,college_id,interested_course,source,created_by,assigned_counsellor,counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email)",
        )
        .order("created_at", { ascending: false });
      if (filters.collegeId) leadsQuery = leadsQuery.eq("college_id", filters.collegeId);
      if (filters.source) leadsQuery = leadsQuery.eq("source", filters.source);
      if (filters.leadCreatedBy === "system") {
        leadsQuery = leadsQuery.is("created_by", null);
      } else if (filters.leadCreatedBy === "users") {
        leadsQuery = leadsQuery.not("created_by", "is", null);
      }
      if (filters.counsellorId) {
        leadsQuery = leadsQuery.eq("assigned_counsellor", filters.counsellorId);
      }

      const [{ data: events, error: eventsError }, { data: crmEntriesRange, error: crmRangeError }, { data: crmEntriesMonth, error: crmMonthError }, { data: profiles, error: profilesError }, { data: colleges, error: collegesError }, { data: leads, error: leadsError }] =
        await Promise.all([
          eventsQuery,
          crmRangeQuery,
          crmMonthQuery,
          supabase
            .from("profiles")
            .select("*")
            .eq("is_active", true)
            .order("full_name", { ascending: true }),
          supabase
            .from("colleges")
            .select("*")
            .order("name", { ascending: true }),
          leadsQuery,
        ]);

      if (eventsError) throw new Error(eventsError.message);
      if (crmRangeError) throw new Error(crmRangeError.message);
      if (crmMonthError) throw new Error(crmMonthError.message);
      if (profilesError) throw new Error(profilesError.message);
      if (collegesError) throw new Error(collegesError.message);
      if (leadsError) throw new Error(leadsError.message);

      const normalizedEvents = ((events ?? []) as RawUserAuditEventRow[]).map((event) => ({
        ...event,
        user: flattenRelation(event.user),
        lead: flattenRelation(event.lead),
      }));
      const scopedEvents = normalizedEvents.filter((event) => {
        if (filters.collegeId && event.lead?.college_id !== filters.collegeId) return false;
        if (coursesNeedle) {
          const eventCourse = normalizeCourse(event.lead?.interested_course);
          if (eventCourse !== coursesNeedle) return false;
        }
        if (filters.leadCreatedBy === "system" && event.lead?.created_by !== null) {
          return false;
        }
        if (filters.leadCreatedBy === "users" && !event.lead?.created_by) {
          return false;
        }
        return true;
      });
      const normalizedCrmRange = ((crmEntriesRange ?? []) as RawCrmEntryRow[]).map((entry) => ({
        ...entry,
        user: flattenRelation(entry.user),
      }));
      const normalizedCrmMonth = ((crmEntriesMonth ?? []) as RawCrmEntryRow[]).map((entry) => ({
        ...entry,
        user: flattenRelation(entry.user),
      }));
      const normalizedLeads = ((leads ?? []) as RawAdminReportLeadRow[]).map((lead) => ({
        ...lead,
        counsellor: flattenRelation(lead.counsellor),
      }));
      const scopedLeads = normalizedLeads.filter((lead) => {
        if (coursesNeedle) {
          const leadCourse = normalizeCourse(lead.interested_course);
          if (leadCourse !== coursesNeedle) return false;
        }
        return true;
      });

      return {
        events: scopedEvents,
        crmEntriesRange: normalizedCrmRange,
        crmEntriesMonth: normalizedCrmMonth,
        leads: scopedLeads,
        profiles: (profiles ?? []) as Profile[],
        colleges: (colleges ?? []) as College[],
      };
    },
  });
}
