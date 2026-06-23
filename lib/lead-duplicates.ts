import { isTerminalLeadStatus, type LeadStatus } from "@/lib/types";
import { canonicalizePhoneKey } from "@/lib/phone";

/**
 * Duplicate rule: a lead is a duplicate when normalized phone + college +
 * normalized course all match an existing lead. The same person inquiring
 * about a different course (or college) is a legitimate new lead.
 *
 * Matches against active leads are duplicates (warn + flag); matches against
 * terminal leads are re-inquiries and only surfaced as history context.
 */

export type DuplicateCheckLead = {
  id: string;
  full_name: string;
  phone: string;
  college_id: string | null;
  interested_course: string | null;
  status: LeadStatus;
  created_at: string;
};

export type DuplicateCheckCandidate = {
  phone: string;
  collegeId: string | null;
  course: string | null;
  /** When editing, the lead's own id so it doesn't match itself. */
  excludeLeadId?: string | null;
};

export type DuplicateCheckResult<T extends DuplicateCheckLead> = {
  /** Same phone + college + course on a lead still being worked → duplicate. */
  activeMatches: T[];
  /** Same key on a closed lead → previous history, not a duplicate. */
  terminalMatches: T[];
};

export function normalizePhoneKey(phone: string | null | undefined): string {
  return canonicalizePhoneKey(phone);
}

export function normalizeCourseKey(course: string | null | undefined): string {
  return (course ?? "").trim().toLowerCase();
}

export function findDuplicateLeads<T extends DuplicateCheckLead>(
  leads: T[],
  candidate: DuplicateCheckCandidate,
): DuplicateCheckResult<T> {
  const phoneKey = normalizePhoneKey(candidate.phone);
  if (phoneKey.length < 5) return { activeMatches: [], terminalMatches: [] };

  const collegeKey = candidate.collegeId || null;
  const courseKey = normalizeCourseKey(candidate.course);
  // Leads without college/course (e.g. chat conversions) match on phone alone,
  // otherwise duplicates from those sources would never be caught.
  const phoneOnly = !collegeKey && !courseKey;

  const matches = leads.filter((lead) => {
    if (candidate.excludeLeadId && lead.id === candidate.excludeLeadId) return false;
    if (normalizePhoneKey(lead.phone) !== phoneKey) return false;
    if (phoneOnly) return true;
    return (
      (lead.college_id || null) === collegeKey &&
      normalizeCourseKey(lead.interested_course) === courseKey
    );
  });

  return {
    activeMatches: matches.filter((lead) => !isTerminalLeadStatus(lead.status)),
    terminalMatches: matches.filter((lead) => isTerminalLeadStatus(lead.status)),
  };
}
