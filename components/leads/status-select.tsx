"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusWorkflowDialog } from "@/components/leads/status-workflow-dialog";
import { LeadStatusBadge } from "@/components/leads/status-badge";
import type { LeadWithRelations } from "@/lib/hooks/use-leads";
import { useFollowUps } from "@/lib/hooks/use-follow-ups";
import {
  evaluateLeadTransition,
  type LeadTransitionContext,
} from "@/lib/lead-pipeline";
import {
  COUNSELLING_STATUSES,
  LEAD_STATUS_LABELS,
  PIPELINE_LEAD_STATUSES,
  type Lead,
  type LeadStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type LeadLike = Lead | LeadWithRelations;

type Props = {
  lead: LeadLike;
  triggerClassName?: string;
};

/**
 * Status dropdown that enforces the counselling pipeline rules.
 *
 * - Statuses that violate the flow are disabled with an explanation tooltip.
 * - Picking a "workflow" status (counselling_completed, not_interested, etc.)
 *   opens a guided dialog that captures the required fields and triggers the
 *   appropriate side-effects (creating/clearing follow-ups, logging activity).
 */
export function LeadStatusSelect({ lead, triggerClassName }: Props) {
  const [pending, setPending] = React.useState<LeadStatus | null>(null);
  const { data: followUps } = useFollowUps({
    leadId: lead.id,
    assignedTo: undefined,
  });

  const completedCounsellingFollowUps = React.useMemo(
    () =>
      (followUps ?? []).filter(
        (f) => f.status === "completed" && f.sequence != null,
      ).length,
    [followUps],
  );

  const hasEnteredCounselling = React.useMemo(() => {
    if (COUNSELLING_STATUSES.includes(lead.status)) return true;
    if (lead.counselling_completed_at) return true;
    return (followUps ?? []).some((f) => f.sequence != null);
  }, [followUps, lead]);

  const hasCompletedCounselling =
    lead.status === "counselling_completed" || !!lead.counselling_completed_at;

  const ctx: LeadTransitionContext = {
    currentStatus: lead.status,
    hasEnteredCounselling,
    hasCompletedCounselling,
    completedCounsellingFollowUps,
  };

  const options = PIPELINE_LEAD_STATUSES.map((status) => {
    const evaluation = evaluateLeadTransition(status, ctx);
    return { status, ...evaluation };
  });

  return (
    <>
      <Select
        value={lead.status}
        onValueChange={(v) => {
          if (v === lead.status) return;
          setPending(v as LeadStatus);
        }}
      >
        <SelectTrigger
          className={cn("h-8 w-[200px] text-xs", triggerClassName)}
        >
          <SelectValue asChild>
            <span>
              <LeadStatusBadge status={lead.status} />
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(({ status, allowed, reason }) => (
            <SelectItem
              key={status}
              value={status}
              disabled={!allowed && status !== lead.status}
              title={!allowed ? reason : undefined}
            >
              {LEAD_STATUS_LABELS[status]}
              {!allowed && status !== lead.status ? (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  blocked
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <StatusWorkflowDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        lead={lead}
        nextStatus={pending}
      />
    </>
  );
}
