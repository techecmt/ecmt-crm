"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { isLikelyQuestion } from "@/lib/reports/customer-analysis";
import { createClient } from "@/lib/supabase/client";
import { getSgtDayEndUtcIso, getSgtDayStartUtcIso } from "@/lib/timezone";
import type {
  College,
  LeadSource,
  NotInterestedReason,
  Profile,
} from "@/lib/types";

export type CustomerAnalysisFilters = {
  fromDate: string;
  toDate: string;
  collegeIds?: string[];
  courses?: string[];
  sources?: LeadSource[];
  counsellorIds?: string[];
  reasons?: NotInterestedReason[];
  channels?: Array<"whatsapp" | "messenger" | "website">;
  likelyQuestionsOnly?: boolean;
};

export type NotInterestedLeadRow = {
  id: string;
  full_name: string;
  created_at: string;
  updated_at: string;
  college_id: string | null;
  interested_course: string | null;
  source: LeadSource;
  not_interested_reason: NotInterestedReason | null;
  not_interested_notes: string | null;
  assigned_counsellor: string | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
  college: { id: string; name: string } | null;
};

export type CustomerMessageRow = {
  id: string;
  content: string;
  created_at: string;
  conversation_id: string;
  channel: "whatsapp" | "messenger" | "website";
  customer_name: string | null;
  lead_id: string | null;
  lead_name: string | null;
  interested_course: string | null;
  college_id: string | null;
  isLikelyQuestion: boolean;
};

type RelationMaybeArray<T> = T | T[] | null;

type RawNotInterestedLeadRow = Omit<NotInterestedLeadRow, "counsellor" | "college"> & {
  counsellor: RelationMaybeArray<{ id: string; full_name: string | null; email: string }>;
  college: RelationMaybeArray<{ id: string; name: string }>;
};

type RawMessageRow = {
  id: string;
  content: string;
  created_at: string;
  conversation_id: string;
  conversation: RelationMaybeArray<{
    id: string;
    channel: "whatsapp" | "messenger" | "website";
    name: string | null;
    phone: string | null;
    lead_id: string | null;
    lead: RelationMaybeArray<{
      id: string;
      full_name: string;
      interested_course: string | null;
      college_id: string | null;
      source: LeadSource;
      assigned_counsellor: string | null;
    }>;
  }>;
};

const MESSAGE_BATCH_SIZE = 1000;
const MESSAGE_FETCH_LIMIT = 5000;

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

function matchesLeadFilters(
  lead: {
    college_id: string | null;
    interested_course: string | null;
    source: LeadSource;
    assigned_counsellor: string | null;
  },
  filters: CustomerAnalysisFilters,
) {
  if (filters.collegeIds?.length && (!lead.college_id || !filters.collegeIds.includes(lead.college_id))) {
    return false;
  }
  if (filters.sources?.length && !filters.sources.includes(lead.source)) {
    return false;
  }
  if (filters.counsellorIds?.length) {
    if (!lead.assigned_counsellor || !filters.counsellorIds.includes(lead.assigned_counsellor)) {
      return false;
    }
  }
  if (filters.courses?.length) {
    const course = normalizeCourse(lead.interested_course);
    const selected = filters.courses.map(normalizeCourse).filter(Boolean);
    if (!selected.includes(course)) return false;
  }
  return true;
}

async function fetchUserMessages(fromIso: string, toIso: string) {
  const supabase = createClient();
  const rows: RawMessageRow[] = [];
  let from = 0;

  while (rows.length < MESSAGE_FETCH_LIMIT) {
    const to = from + MESSAGE_BATCH_SIZE - 1;
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, content, created_at, conversation_id, conversation:conversations(id, channel, name, phone, lead_id, lead:leads(id, full_name, interested_course, college_id, source, assigned_counsellor))",
      )
      .eq("role", "user")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    rows.push(...(data as RawMessageRow[]));
    if (data.length < MESSAGE_BATCH_SIZE) break;
    from += MESSAGE_BATCH_SIZE;
  }

  return rows.slice(0, MESSAGE_FETCH_LIMIT);
}

export function useCustomerAnalysisReport(filters: CustomerAnalysisFilters) {
  return useQuery({
    queryKey: ["reports", "customer-analysis", filters],
    placeholderData: keepPreviousData,
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
          "id, full_name, created_at, updated_at, college_id, interested_course, source, not_interested_reason, not_interested_notes, assigned_counsellor, counsellor:profiles!leads_assigned_counsellor_fkey(id, full_name, email), college:colleges(id, name)",
        )
        .eq("status", "not_interested")
        .gte("updated_at", fromIso)
        .lte("updated_at", toIso)
        .order("updated_at", { ascending: false });

      if (filters.collegeIds?.length) {
        leadsQuery = leadsQuery.in("college_id", filters.collegeIds);
      }
      if (filters.sources?.length) {
        leadsQuery = leadsQuery.in("source", filters.sources);
      }
      if (filters.counsellorIds?.length) {
        leadsQuery = leadsQuery.in("assigned_counsellor", filters.counsellorIds);
      }
      if (filters.reasons?.length) {
        leadsQuery = leadsQuery.in("not_interested_reason", filters.reasons);
      }

      const [
        { data: rawLeads, error: leadsError },
        { count: totalLeadsInPeriod, error: totalLeadsError },
        rawMessages,
        { data: profiles, error: profilesError },
        { data: colleges, error: collegesError },
      ] = await Promise.all([
        leadsQuery,
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        fetchUserMessages(fromIso, toIso),
        supabase
          .from("profiles")
          .select("*")
          .eq("is_active", true)
          .order("full_name", { ascending: true }),
        supabase.from("colleges").select("*").order("name", { ascending: true }),
      ]);

      if (leadsError) throw new Error(leadsError.message);
      if (totalLeadsError) throw new Error(totalLeadsError.message);
      if (profilesError) throw new Error(profilesError.message);
      if (collegesError) throw new Error(collegesError.message);

      let notInterestedLeads = ((rawLeads ?? []) as RawNotInterestedLeadRow[]).map((lead) => ({
        ...lead,
        counsellor: flattenRelation(lead.counsellor),
        college: flattenRelation(lead.college),
      }));

      if (selectedCourses.length > 0) {
        notInterestedLeads = notInterestedLeads.filter((lead) =>
          selectedCourses.includes(normalizeCourse(lead.interested_course)),
        );
      }

      const messages: CustomerMessageRow[] = [];
      for (const row of rawMessages) {
        const conversation = flattenRelation(row.conversation);
        if (!conversation) continue;
        if (filters.channels?.length && !filters.channels.includes(conversation.channel)) {
          continue;
        }

        const lead = flattenRelation(conversation.lead);
        if (
          lead &&
          !matchesLeadFilters(
            {
              college_id: lead.college_id,
              interested_course: lead.interested_course,
              source: lead.source,
              assigned_counsellor: lead.assigned_counsellor,
            },
            filters,
          )
        ) {
          continue;
        }

        const likely = isLikelyQuestion(row.content);
        if (filters.likelyQuestionsOnly && !likely) continue;

        messages.push({
          id: row.id,
          content: row.content,
          created_at: row.created_at,
          conversation_id: conversation.id,
          channel: conversation.channel,
          customer_name: conversation.name || conversation.phone,
          lead_id: lead?.id ?? conversation.lead_id,
          lead_name: lead?.full_name ?? null,
          interested_course: lead?.interested_course ?? null,
          college_id: lead?.college_id ?? null,
          isLikelyQuestion: likely,
        });
      }

      const courseOptions = Array.from(
        new Set(
          [
            ...notInterestedLeads.map((lead) => lead.interested_course),
            ...messages.map((message) => message.interested_course),
          ]
            .map((course) => (course ?? "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));

      return {
        notInterestedLeads,
        totalLeadsInPeriod: totalLeadsInPeriod ?? 0,
        messages,
        messagesTruncated: rawMessages.length >= MESSAGE_FETCH_LIMIT,
        profiles: (profiles ?? []) as Profile[],
        colleges: (colleges ?? []) as College[],
        courseOptions,
      };
    },
  });
}
