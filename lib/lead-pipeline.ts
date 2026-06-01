import {
  type LeadStatus,
  COUNSELLING_STATUSES,
  PIPELINE_LEAD_STATUSES,
  STATUSES_THAT_CLEAR_PENDING_FOLLOWUPS,
  TERMINAL_LEAD_STATUSES,
} from "@/lib/types";

/**
 * Sophisticated lead-status flow rules for the college admissions pipeline.
 *
 * Highlights enforced here:
 * - "Inquiry Received" is the only entry point.
 * - "Invalid Contact" can ONLY be set directly after "Inquiry Received".
 * - "Not Interested" requires that the lead has entered the counselling stages
 *   at some point (Counselling In-Progress or Counselling Completed).
 * - Registration statuses require counselling to be completed first.
 */

/** Inputs needed to evaluate whether a transition is allowed. */
export interface LeadTransitionContext {
  /** Status the lead is currently in. */
  currentStatus: LeadStatus;
  /** True if the lead has ever been in a counselling stage. */
  hasEnteredCounselling: boolean;
  /** True if the lead has fully completed all counselling checks/fields. */
  hasCompletedCounselling: boolean;
  /** How many counselling follow-ups have been completed so far. */
  completedCounsellingFollowUps: number;
}

export interface TransitionEvaluation {
  allowed: boolean;
  reason?: string;
}

const ENTRY_STATUS: LeadStatus = "inquiry_received";

/** Whether the given status can be selected as the next status given the lead context. */
export function evaluateLeadTransition(
  next: LeadStatus,
  ctx: LeadTransitionContext,
): TransitionEvaluation {
  if (ctx.currentStatus === next) return { allowed: true };

  switch (next) {
    case "inquiry_received":
      // Re-opening is allowed only from cleared/terminal states by admins; surface as allowed in UI.
      return { allowed: true };

    case "counselling_in_progress":
      return { allowed: true };

    case "counselling_completed":
      if (!COUNSELLING_STATUSES.includes(ctx.currentStatus) && ctx.currentStatus !== "counselling_in_progress") {
        return {
          allowed: false,
          reason: "Start counselling first before marking it as completed.",
        };
      }
      return { allowed: true };

    case "no_response":
      if (!COUNSELLING_STATUSES.includes(ctx.currentStatus)) {
        return {
          allowed: false,
          reason: "No Response can only be set during Counselling In-Progress or Counselling Completed.",
        };
      }
      return { allowed: true };

    case "not_interested":
      if (!ctx.hasEnteredCounselling) {
        return {
          allowed: false,
          reason: "A lead can only be marked Not Interested after entering counselling.",
        };
      }
      return { allowed: true };

    case "invalid":
      if (ctx.currentStatus !== ENTRY_STATUS) {
        return {
          allowed: false,
          reason: "Invalid Contact can only be set immediately after Inquiry Received.",
        };
      }
      return { allowed: true };

    case "course_not_started":
      return { allowed: true };

    case "registration_unpaid":
    case "registered_paid_reg_fee":
      if (!ctx.hasCompletedCounselling) {
        return {
          allowed: false,
          reason: "Counselling must be completed before moving to a Registration stage.",
        };
      }
      return { allowed: true };

    default:
      // Legacy statuses remain technically settable for backward compatibility.
      return { allowed: true };
  }
}

/** Get the list of statuses that can be selected next from the current state. */
export function availableNextStatuses(ctx: LeadTransitionContext): LeadStatus[] {
  return PIPELINE_LEAD_STATUSES.filter((status) =>
    evaluateLeadTransition(status, ctx).allowed,
  );
}

export function shouldClearPendingFollowUps(next: LeadStatus): boolean {
  return STATUSES_THAT_CLEAR_PENDING_FOLLOWUPS.includes(next);
}

export function isCounsellingInProgress(status: LeadStatus): boolean {
  return status === "counselling_in_progress";
}

/** Statuses where the system actively expects a pending follow-up for the lead. */
export function statusRequiresFollowUp(status: LeadStatus): boolean {
  return !TERMINAL_LEAD_STATUSES.includes(status);
}
