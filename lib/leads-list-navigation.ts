import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type LeadSource,
  type LeadStatus,
} from "@/lib/types";
import type { LeadFilters, LeadWithRelations } from "@/lib/hooks/use-leads";

export type LeadsSortKey = "created_at" | "full_name" | "lead_score" | "status" | "source";
export type LeadsSortDir = "asc" | "desc";

export type LeadsExpertSearchState = {
  mustInclude: string;
  exclude: string;
  city: string;
  interestedCourse: string;
  campaign: string;
  minScore: string;
  maxScore: string;
  hasEmailOnly: boolean;
  duplicatesOnly: boolean;
};

export type LeadsListNavigationState = {
  filters: {
    status: LeadStatus | "all";
    source: LeadSource | "all";
    collegeId: string | "all";
    course: string | "all";
  };
  counsellorIds: string[];
  search: string;
  expertSearch: LeadsExpertSearchState;
  sortKey: LeadsSortKey;
  sortDir: LeadsSortDir;
};

const SORT_KEYS: LeadsSortKey[] = ["created_at", "full_name", "lead_score", "status", "source"];
const SORT_DIRS: LeadsSortDir[] = ["asc", "desc"];

const defaultExpertSearch: LeadsExpertSearchState = {
  mustInclude: "",
  exclude: "",
  city: "",
  interestedCourse: "",
  campaign: "",
  minScore: "",
  maxScore: "",
  hasEmailOnly: false,
  duplicatesOnly: false,
};

export function getDefaultLeadsListNavigationState(
  currentUserId: string,
): LeadsListNavigationState {
  return {
    filters: {
      status: "all",
      source: "all",
      collegeId: "all",
      course: "all",
    },
    counsellorIds: [currentUserId],
    search: "",
    expertSearch: { ...defaultExpertSearch },
    sortKey: "created_at",
    sortDir: "desc",
  };
}

function isKnownSortKey(value: string): value is LeadsSortKey {
  return SORT_KEYS.includes(value as LeadsSortKey);
}

function isKnownSortDir(value: string): value is LeadsSortDir {
  return SORT_DIRS.includes(value as LeadsSortDir);
}

/** Parse list filters/sort from a leads return path (e.g. /dashboard/leads?status=...). */
export function parseLeadsListStateFromReturnPath(
  returnPath: string,
  currentUserId: string,
): LeadsListNavigationState {
  const fallback = getDefaultLeadsListNavigationState(currentUserId);
  if (!returnPath.startsWith("/dashboard/leads")) {
    return fallback;
  }

  const queryIndex = returnPath.indexOf("?");
  if (queryIndex === -1) {
    return fallback;
  }

  const query = new URLSearchParams(returnPath.slice(queryIndex + 1));
  const hasState = [
    "status",
    "source",
    "college",
    "course",
    "counsellors",
    "q",
    "sort",
    "dir",
    "ex_must",
    "ex_exclude",
    "ex_city",
    "ex_course",
    "ex_campaign",
    "ex_min",
    "ex_max",
    "ex_email",
    "ex_dup",
  ].some((key) => query.has(key));

  if (!hasState) {
    return fallback;
  }

  const counsellorIds = (query.get("counsellors") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const sortKeyRaw = query.get("sort") ?? fallback.sortKey;
  const sortDirRaw = query.get("dir") ?? fallback.sortDir;

  return {
    filters: {
      status: (query.get("status") as LeadStatus | "all") || fallback.filters.status,
      source: (query.get("source") as LeadSource | "all") || fallback.filters.source,
      collegeId: query.get("college") || fallback.filters.collegeId,
      course: query.get("course") || fallback.filters.course,
    },
    counsellorIds: counsellorIds.length > 0 ? counsellorIds : fallback.counsellorIds,
    search: query.get("q") ?? fallback.search,
    sortKey: isKnownSortKey(sortKeyRaw) ? sortKeyRaw : fallback.sortKey,
    sortDir: isKnownSortDir(sortDirRaw) ? sortDirRaw : fallback.sortDir,
    expertSearch: {
      mustInclude: query.get("ex_must") ?? "",
      exclude: query.get("ex_exclude") ?? "",
      city: query.get("ex_city") ?? "",
      interestedCourse: query.get("ex_course") ?? "",
      campaign: query.get("ex_campaign") ?? "",
      minScore: query.get("ex_min") ?? "",
      maxScore: query.get("ex_max") ?? "",
      hasEmailOnly: query.get("ex_email") === "1",
      duplicatesOnly: query.get("ex_dup") === "1",
    },
  };
}

export function toLeadFilters(state: LeadsListNavigationState): LeadFilters {
  return {
    ...state.filters,
    counsellorIds: state.counsellorIds,
    search: state.search || undefined,
    status: "all",
  };
}

export function applyExpertSearchFilter(
  leads: LeadWithRelations[],
  expertSearch: LeadsExpertSearchState,
): LeadWithRelations[] {
  if (!leads.length) return [];

  const includeTerms = expertSearch.mustInclude
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const excludeTerms = expertSearch.exclude
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const city = expertSearch.city.trim().toLowerCase();
  const course = expertSearch.interestedCourse.trim().toLowerCase();
  const campaign = expertSearch.campaign.trim().toLowerCase();
  const minScore = expertSearch.minScore.trim() ? Number(expertSearch.minScore) : null;
  const maxScore = expertSearch.maxScore.trim() ? Number(expertSearch.maxScore) : null;

  return leads.filter((lead) => {
    const haystack = [
      lead.full_name,
      lead.phone,
      lead.email ?? "",
      lead.city ?? "",
      lead.interested_course ?? "",
      lead.campaign ?? "",
      lead.utm_source ?? "",
      lead.utm_medium ?? "",
      lead.utm_campaign ?? "",
      lead.description ?? "",
    ]
      .join(" ")
      .toLowerCase();

    if (!includeTerms.every((term) => haystack.includes(term))) return false;
    if (excludeTerms.some((term) => haystack.includes(term))) return false;
    if (city && !(lead.city ?? "").toLowerCase().includes(city)) return false;
    if (course && !(lead.interested_course ?? "").toLowerCase().includes(course)) {
      return false;
    }
    if (campaign && !(lead.campaign ?? "").toLowerCase().includes(campaign)) {
      return false;
    }
    if (minScore !== null && !Number.isNaN(minScore) && lead.lead_score < minScore) {
      return false;
    }
    if (maxScore !== null && !Number.isNaN(maxScore) && lead.lead_score > maxScore) {
      return false;
    }
    if (expertSearch.hasEmailOnly && !lead.email) return false;
    if (expertSearch.duplicatesOnly && !lead.is_duplicate) return false;

    return true;
  });
}

export function applyStatusFilter(
  leads: LeadWithRelations[],
  status: LeadStatus | "all",
): LeadWithRelations[] {
  if (!status || status === "all") return leads;
  return leads.filter((lead) => lead.status === status);
}

export function sortLeadsList(
  leads: LeadWithRelations[],
  sortKey: LeadsSortKey,
  sortDir: LeadsSortDir,
): LeadWithRelations[] {
  const list = [...leads];
  const direction = sortDir === "asc" ? 1 : -1;

  list.sort((a, b) => {
    if (sortKey === "created_at") {
      return (
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
      );
    }
    if (sortKey === "full_name") {
      return a.full_name.localeCompare(b.full_name) * direction;
    }
    if (sortKey === "lead_score") {
      return (a.lead_score - b.lead_score) * direction;
    }
    if (sortKey === "status") {
      return (
        LEAD_STATUS_LABELS[a.status].localeCompare(LEAD_STATUS_LABELS[b.status]) * direction
      );
    }
    return LEAD_SOURCE_LABELS[a.source].localeCompare(LEAD_SOURCE_LABELS[b.source]) * direction;
  });

  return list;
}

export function buildSortedLeadList(
  allLeads: LeadWithRelations[],
  state: LeadsListNavigationState,
): LeadWithRelations[] {
  const expertFiltered = applyExpertSearchFilter(allLeads, state.expertSearch);
  const statusFiltered = applyStatusFilter(expertFiltered, state.filters.status);
  return sortLeadsList(statusFiltered, state.sortKey, state.sortDir);
}

export function getAdjacentLeadIds(
  sortedLeads: LeadWithRelations[],
  currentLeadId: string,
): {
  prevId: string | null;
  nextId: string | null;
  index: number;
  total: number;
} {
  const index = sortedLeads.findIndex((lead) => lead.id === currentLeadId);
  if (index === -1) {
    return { prevId: null, nextId: null, index: -1, total: sortedLeads.length };
  }
  return {
    prevId: index > 0 ? sortedLeads[index - 1].id : null,
    nextId: index < sortedLeads.length - 1 ? sortedLeads[index + 1].id : null,
    index,
    total: sortedLeads.length,
  };
}

export function buildLeadDetailHref(leadId: string, returnPath: string): string {
  return `/dashboard/leads/${leadId}?from=${encodeURIComponent(returnPath)}`;
}
