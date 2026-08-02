"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  isRegistrationPaid,
  isRegistrationUnpaid,
} from "@/lib/hooks/use-registration-report";
import {
  type DateRange,
  isValidDateRange,
} from "@/lib/reports/comparison-periods";
import { createClient } from "@/lib/supabase/client";
import { getSgtDateKey, getSgtDayEndUtcIso, getSgtDayStartUtcIso } from "@/lib/timezone";
import type { College, LeadSource, LeadStatus, Profile } from "@/lib/types";

export type ComparisonReportFilters = {
  periodA: DateRange;
  periodB: DateRange;
  collegeIds?: string[];
  courses?: string[];
  sources?: LeadSource[];
  counsellorIds?: string[];
};

export type ComparisonLeadRow = {
  id: string;
  full_name: string;
  created_at: string;
  counselling_completed_at: string | null;
  registration_completed_at: string | null;
  status: LeadStatus;
  college_id: string | null;
  interested_course: string | null;
  source: LeadSource;
  assigned_counsellor: string | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

export type PeriodMetrics = {
  leadsCreated: number;
  counsellingCompleted: number;
  cohortRegistrations: number;
  conversionRate: number;
  registrationsTotal: number;
  registrationsUnpaid: number;
  registrationsPaid: number;
};

export type DimensionMetrics = {
  leadsCreated: number;
  counsellingCompleted: number;
  cohortRegistrations: number;
  conversionRate: number;
  registrationsTotal: number;
  registrationsUnpaid: number;
  registrationsPaid: number;
};

export type DimensionComparisonRow = {
  id: string;
  name: string;
  periodA: DimensionMetrics;
  periodB: DimensionMetrics;
};

type RelationMaybeArray<T> = T | T[] | null;

type RawComparisonLeadRow = Omit<ComparisonLeadRow, "counsellor"> & {
  counsellor: RelationMaybeArray<{ id: string; full_name: string | null; email: string }>;
};

const COUNSELLING_COMPLETED_STATUSES = new Set<LeadStatus>([
  "counselling_completed",
  "registration_unpaid",
  "registered_paid_reg_fee",
  "registered_closed",
  "registered_dropped_out",
]);

const REGISTRATION_STATUSES = new Set<LeadStatus>([
  "registration_unpaid",
  "registered_paid_reg_fee",
  "registered_closed",
  "registered_dropped_out",
]);

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

function minDateKey(a: string, b: string) {
  return a <= b ? a : b;
}

function maxDateKey(a: string, b: string) {
  return a >= b ? a : b;
}

function dateKeyInRange(dateKey: string, range: DateRange) {
  return dateKey >= range.from && dateKey <= range.to;
}

export function isCounsellingCompleted(lead: Pick<ComparisonLeadRow, "status" | "counselling_completed_at">) {
  return (
    COUNSELLING_COMPLETED_STATUSES.has(lead.status) || !!lead.counselling_completed_at
  );
}

export function isCohortRegistered(lead: Pick<ComparisonLeadRow, "status" | "registration_completed_at">) {
  return REGISTRATION_STATUSES.has(lead.status) || !!lead.registration_completed_at;
}

function emptyMetrics(): PeriodMetrics {
  return {
    leadsCreated: 0,
    counsellingCompleted: 0,
    cohortRegistrations: 0,
    conversionRate: 0,
    registrationsTotal: 0,
    registrationsUnpaid: 0,
    registrationsPaid: 0,
  };
}

function emptyDimensionMetrics(): DimensionMetrics {
  return {
    leadsCreated: 0,
    counsellingCompleted: 0,
    cohortRegistrations: 0,
    conversionRate: 0,
    registrationsTotal: 0,
    registrationsUnpaid: 0,
    registrationsPaid: 0,
  };
}

function finalizeMetrics(metrics: PeriodMetrics): PeriodMetrics {
  return {
    ...metrics,
    conversionRate:
      metrics.leadsCreated === 0
        ? 0
        : (metrics.cohortRegistrations / metrics.leadsCreated) * 100,
  };
}

function finalizeDimension(metrics: DimensionMetrics): DimensionMetrics {
  return {
    ...metrics,
    conversionRate:
      metrics.leadsCreated === 0
        ? 0
        : (metrics.cohortRegistrations / metrics.leadsCreated) * 100,
  };
}

function applyLeadFilters(
  leads: ComparisonLeadRow[],
  filters: ComparisonReportFilters,
) {
  const selectedCourses = (filters.courses ?? [])
    .map((course) => normalizeCourse(course))
    .filter(Boolean);

  return leads.filter((lead) => {
    if (filters.collegeIds && filters.collegeIds.length > 0) {
      if (!lead.college_id || !filters.collegeIds.includes(lead.college_id)) {
        return false;
      }
    }
    if (filters.sources && filters.sources.length > 0) {
      if (!filters.sources.includes(lead.source)) return false;
    }
    if (filters.counsellorIds && filters.counsellorIds.length > 0) {
      if (
        !lead.assigned_counsellor ||
        !filters.counsellorIds.includes(lead.assigned_counsellor)
      ) {
        return false;
      }
    }
    if (selectedCourses.length > 0) {
      if (!selectedCourses.includes(normalizeCourse(lead.interested_course))) {
        return false;
      }
    }
    return true;
  });
}

function computePeriodMetrics(
  createdLeads: ComparisonLeadRow[],
  registrationLeads: ComparisonLeadRow[],
): PeriodMetrics {
  const metrics = emptyMetrics();
  metrics.leadsCreated = createdLeads.length;
  metrics.counsellingCompleted = createdLeads.filter(isCounsellingCompleted).length;
  metrics.cohortRegistrations = createdLeads.filter(isCohortRegistered).length;

  for (const lead of registrationLeads) {
    metrics.registrationsTotal += 1;
    if (isRegistrationUnpaid(lead.status)) metrics.registrationsUnpaid += 1;
    if (isRegistrationPaid(lead.status)) metrics.registrationsPaid += 1;
  }

  return finalizeMetrics(metrics);
}

function bumpDimension(
  map: Map<string, { name: string; metrics: DimensionMetrics }>,
  id: string,
  name: string,
  bump: (metrics: DimensionMetrics) => void,
) {
  if (!map.has(id)) {
    map.set(id, { name, metrics: emptyDimensionMetrics() });
  }
  const row = map.get(id)!;
  bump(row.metrics);
}

function buildDimensionComparison(
  periodACreated: ComparisonLeadRow[],
  periodBCreated: ComparisonLeadRow[],
  periodARegs: ComparisonLeadRow[],
  periodBRegs: ComparisonLeadRow[],
  getGroup: (lead: ComparisonLeadRow) => { id: string; name: string },
): DimensionComparisonRow[] {
  const aMap = new Map<string, { name: string; metrics: DimensionMetrics }>();
  const bMap = new Map<string, { name: string; metrics: DimensionMetrics }>();

  for (const lead of periodACreated) {
    const group = getGroup(lead);
    bumpDimension(aMap, group.id, group.name, (m) => {
      m.leadsCreated += 1;
      if (isCounsellingCompleted(lead)) m.counsellingCompleted += 1;
      if (isCohortRegistered(lead)) m.cohortRegistrations += 1;
    });
  }
  for (const lead of periodBCreated) {
    const group = getGroup(lead);
    bumpDimension(bMap, group.id, group.name, (m) => {
      m.leadsCreated += 1;
      if (isCounsellingCompleted(lead)) m.counsellingCompleted += 1;
      if (isCohortRegistered(lead)) m.cohortRegistrations += 1;
    });
  }
  for (const lead of periodARegs) {
    const group = getGroup(lead);
    bumpDimension(aMap, group.id, group.name, (m) => {
      m.registrationsTotal += 1;
      if (isRegistrationUnpaid(lead.status)) m.registrationsUnpaid += 1;
      if (isRegistrationPaid(lead.status)) m.registrationsPaid += 1;
    });
  }
  for (const lead of periodBRegs) {
    const group = getGroup(lead);
    bumpDimension(bMap, group.id, group.name, (m) => {
      m.registrationsTotal += 1;
      if (isRegistrationUnpaid(lead.status)) m.registrationsUnpaid += 1;
      if (isRegistrationPaid(lead.status)) m.registrationsPaid += 1;
    });
  }

  const ids = new Set([...aMap.keys(), ...bMap.keys()]);
  return Array.from(ids)
    .map((id) => {
      const a = aMap.get(id);
      const b = bMap.get(id);
      return {
        id,
        name: a?.name ?? b?.name ?? id,
        periodA: finalizeDimension(a?.metrics ?? emptyDimensionMetrics()),
        periodB: finalizeDimension(b?.metrics ?? emptyDimensionMetrics()),
      };
    })
    .sort((left, right) => {
      const leftTotal = left.periodA.leadsCreated + left.periodA.registrationsTotal;
      const rightTotal = right.periodA.leadsCreated + right.periodA.registrationsTotal;
      return rightTotal - leftTotal;
    });
}

export function useComparisonReport(filters: ComparisonReportFilters) {
  const enabled =
    isValidDateRange(filters.periodA) && isValidDateRange(filters.periodB);

  return useQuery({
    queryKey: ["reports", "comparison", filters],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = createClient();
      const overallFrom = minDateKey(filters.periodA.from, filters.periodB.from);
      const overallTo = maxDateKey(filters.periodA.to, filters.periodB.to);
      const fromIso = toIsoRangeStart(overallFrom);
      const toIso = toIsoRangeEnd(overallTo);

      const selectColumns =
        "id,full_name,created_at,counselling_completed_at,registration_completed_at,status,college_id,interested_course,source,assigned_counsellor,counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email)";

      const [
        { data: createdRows, error: createdError },
        { data: registrationRows, error: registrationError },
        { data: profiles, error: profilesError },
        { data: colleges, error: collegesError },
      ] = await Promise.all([
        supabase
          .from("leads")
          .select(selectColumns)
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("leads")
          .select(selectColumns)
          .not("registration_completed_at", "is", null)
          .gte("registration_completed_at", fromIso)
          .lte("registration_completed_at", toIso)
          .order("registration_completed_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("*")
          .eq("is_active", true)
          .order("full_name", { ascending: true }),
        supabase.from("colleges").select("*").order("name", { ascending: true }),
      ]);

      if (createdError) throw new Error(createdError.message);
      if (registrationError) throw new Error(registrationError.message);
      if (profilesError) throw new Error(profilesError.message);
      if (collegesError) throw new Error(collegesError.message);

      const normalize = (rows: RawComparisonLeadRow[] | null) =>
        (rows ?? []).map((lead) => ({
          ...lead,
          counsellor: flattenRelation(lead.counsellor),
        }));

      const createdLeads = applyLeadFilters(
        normalize(createdRows as RawComparisonLeadRow[] | null),
        filters,
      );
      const registrationLeads = applyLeadFilters(
        normalize(registrationRows as RawComparisonLeadRow[] | null),
        filters,
      );

      const partitionCreated = (range: DateRange) =>
        createdLeads.filter((lead) =>
          dateKeyInRange(getSgtDateKey(lead.created_at), range),
        );
      const partitionRegs = (range: DateRange) =>
        registrationLeads.filter((lead) =>
          dateKeyInRange(getSgtDateKey(lead.registration_completed_at!), range),
        );

      const periodACreated = partitionCreated(filters.periodA);
      const periodBCreated = partitionCreated(filters.periodB);
      const periodARegs = partitionRegs(filters.periodA);
      const periodBRegs = partitionRegs(filters.periodB);

      const collegeNameById = new Map(
        ((colleges ?? []) as College[]).map((college) => [college.id, college.name]),
      );

      const toUserName = (
        user: { full_name: string | null; email: string } | null | undefined,
      ) => {
        if (!user) return "Unassigned";
        return user.full_name || user.email;
      };

      return {
        periodA: computePeriodMetrics(periodACreated, periodARegs),
        periodB: computePeriodMetrics(periodBCreated, periodBRegs),
        bySource: buildDimensionComparison(
          periodACreated,
          periodBCreated,
          periodARegs,
          periodBRegs,
          (lead) => ({
            id: lead.source,
            name: lead.source,
          }),
        ),
        byCollege: buildDimensionComparison(
          periodACreated,
          periodBCreated,
          periodARegs,
          periodBRegs,
          (lead) => ({
            id: lead.college_id ?? "unassigned",
            name: lead.college_id
              ? (collegeNameById.get(lead.college_id) ?? "Unknown college")
              : "Unassigned",
          }),
        ),
        byCourse: buildDimensionComparison(
          periodACreated,
          periodBCreated,
          periodARegs,
          periodBRegs,
          (lead) => {
            const trimmed = (lead.interested_course ?? "").trim();
            return {
              id: trimmed || "unspecified",
              name: trimmed || "Unspecified",
            };
          },
        ),
        byCounsellor: buildDimensionComparison(
          periodACreated,
          periodBCreated,
          periodARegs,
          periodBRegs,
          (lead) => ({
            id: lead.assigned_counsellor ?? "unassigned",
            name: toUserName(lead.counsellor),
          }),
        ),
        profiles: (profiles ?? []) as Profile[],
        colleges: (colleges ?? []) as College[],
      };
    },
  });
}
