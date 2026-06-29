import type { LeadStatus } from "@/lib/types";

/**
 * Duplicate matching is DB-authoritative via get_lead_duplicate_matches().
 * Client-side logic only splits rows for presentation severity.
 */
export type DuplicateCheckLead = {
  id: string;
  full_name: string;
  phone: string;
  college_id: string | null;
  interested_course: string | null;
  status: LeadStatus;
  created_at: string;
  is_terminal: boolean;
  same_context: boolean;
};

export type DuplicateCheckResult<T extends DuplicateCheckLead> = {
  /** Any active lead with same duplicate group key (phone group). */
  activeMatches: T[];
  /** Active leads that also match college+course context. */
  exactActiveMatches: T[];
  /** Active leads on same phone but different college/course context. */
  relatedActiveMatches: T[];
  /** Terminal leads in same phone group, shown as historical context. */
  terminalMatches: T[];
};

export function classifyDuplicateMatches<T extends DuplicateCheckLead>(
  matches: T[],
): DuplicateCheckResult<T> {
  const activeMatches = matches.filter((lead) => !lead.is_terminal);
  const terminalMatches = matches.filter((lead) => lead.is_terminal);
  const exactActiveMatches = activeMatches.filter((lead) => lead.same_context);
  const relatedActiveMatches = activeMatches.filter((lead) => !lead.same_context);

  return {
    activeMatches,
    exactActiveMatches,
    relatedActiveMatches,
    terminalMatches,
  };
}
