"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { getSgtDayEndUtcIso, getSgtDayStartUtcIso } from "@/lib/timezone";
import type { College, LeadSource, LeadStatus, Profile } from "@/lib/types";

export type RegistrationReportFilters = {
  fromDate: string;
  toDate: string;
  collegeIds?: string[];
  courses?: string[];
  sources?: LeadSource[];
  counsellorIds?: string[];
  paymentStatuses?: Array<"unpaid" | "paid">;
};

export type RegistrationReportLeadRow = {
  id: string;
  full_name: string;
  created_at: string;
  registration_completed_at: string;
  status: LeadStatus;
  college_id: string | null;
  interested_course: string | null;
  source: LeadSource;
  assigned_counsellor: string | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

type RelationMaybeArray<T> = T | T[] | null;

type RawRegistrationReportLeadRow = Omit<RegistrationReportLeadRow, "counsellor"> & {
  counsellor: RelationMaybeArray<{ id: string; full_name: string | null; email: string }>;
};

function flattenRelation<T>(value: RelationMaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toIsoRangeStart(date: string) {
  return getSgtDayStartUtcIso(date) ?? `${date}T00:00:00.000Z`;
}

function toIsoRangeEnd(date: string) {
  return getSgtDayEndUtcIso(date) ?? `${date}T23:59:59.999Z`;
}

function normalizeCourse(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function isRegistrationUnpaid(status: LeadStatus) {
  return status === "registration_unpaid";
}

export function isRegistrationPaid(status: LeadStatus) {
  return status === "registered_paid_reg_fee" || status === "registered_closed";
}

export function useRegistrationReport(filters: RegistrationReportFilters) {
  return useQuery({
    queryKey: ["reports", "registration", filters],
    queryFn: async () => {
      const supabase = createClient();
      const fromIso = toIsoRangeStart(filters.fromDate);
      const toIso = toIsoRangeEnd(filters.toDate);
      const selectedCourses = (filters.courses ?? [])
        .map((course) => normalizeCourse(course))
        .filter(Boolean);

      let leadsQuery = supabase
        .from("leads")
        .select(
          "id,full_name,created_at,registration_completed_at,status,college_id,interested_course,source,assigned_counsellor,counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email)",
        )
        .not("registration_completed_at", "is", null)
        .gte("registration_completed_at", fromIso)
        .lte("registration_completed_at", toIso)
        .order("registration_completed_at", { ascending: false });

      if (filters.collegeIds && filters.collegeIds.length > 0) {
        leadsQuery = leadsQuery.in("college_id", filters.collegeIds);
      }
      if (filters.sources && filters.sources.length > 0) {
        leadsQuery = leadsQuery.in("source", filters.sources);
      }
      if (filters.counsellorIds && filters.counsellorIds.length > 0) {
        leadsQuery = leadsQuery.in("assigned_counsellor", filters.counsellorIds);
      }

      const [{ data: leads, error: leadsError }, { data: profiles, error: profilesError }, { data: colleges, error: collegesError }] =
        await Promise.all([
          leadsQuery,
          supabase
            .from("profiles")
            .select("*")
            .eq("is_active", true)
            .order("full_name", { ascending: true }),
          supabase
            .from("colleges")
            .select("*")
            .order("name", { ascending: true }),
        ]);

      if (leadsError) throw new Error(leadsError.message);
      if (profilesError) throw new Error(profilesError.message);
      if (collegesError) throw new Error(collegesError.message);

      let normalizedLeads = ((leads ?? []) as RawRegistrationReportLeadRow[]).map((lead) => ({
        ...lead,
        counsellor: flattenRelation(lead.counsellor),
        registration_completed_at: lead.registration_completed_at!,
      }));

      if (selectedCourses.length > 0) {
        normalizedLeads = normalizedLeads.filter((lead) =>
          selectedCourses.includes(normalizeCourse(lead.interested_course)),
        );
      }

      const paymentStatuses = filters.paymentStatuses ?? [];
      if (paymentStatuses.length === 1) {
        if (paymentStatuses[0] === "unpaid") {
          normalizedLeads = normalizedLeads.filter((lead) => isRegistrationUnpaid(lead.status));
        } else {
          normalizedLeads = normalizedLeads.filter((lead) => isRegistrationPaid(lead.status));
        }
      } else if (paymentStatuses.length > 1) {
        normalizedLeads = normalizedLeads.filter(
          (lead) => isRegistrationUnpaid(lead.status) || isRegistrationPaid(lead.status),
        );
      }

      return {
        leads: normalizedLeads,
        profiles: (profiles ?? []) as Profile[],
        colleges: (colleges ?? []) as College[],
      };
    },
  });
}
