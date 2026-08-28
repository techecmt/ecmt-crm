"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCampaign } from "@/lib/hooks/use-campaigns";
import {
  CAMPAIGN_RECIPIENT_STATUS_LABELS,
  CAMPAIGN_SKIP_REASON_LABELS,
  CAMPAIGN_STATUS_LABELS,
  campaignProgress,
  renderTemplateBody,
  type CampaignRecipientStatus,
} from "@/lib/campaigns";
import { formatSgtDateTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const RECIPIENT_STATUS_STYLES: Record<CampaignRecipientStatus, string> = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  sending: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  skipped: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
};

export function CampaignDetailSheet({
  campaignId,
  onClose,
}: {
  campaignId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useCampaign(campaignId);
  const [statusFilter, setStatusFilter] = React.useState<CampaignRecipientStatus | "all">("all");

  const recipients = React.useMemo(() => {
    if (!data) return [];
    if (statusFilter === "all") return data.recipients;
    return data.recipients.filter((recipient) => recipient.status === statusFilter);
  }, [data, statusFilter]);

  return (
    <Sheet open={Boolean(campaignId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
        {isLoading || !data ? (
          <div className="space-y-3 p-1">
            <Skeleton className="h-8" />
            <Skeleton className="h-24" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-1 pb-3">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {data.campaign.name}
                <Badge variant="secondary" className="border-0">
                  {CAMPAIGN_STATUS_LABELS[data.campaign.status]}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {data.campaign.template_name || data.campaign.content_sid} ·{" "}
                {formatSgtDateTime(data.campaign.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {data.campaign.error ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {data.campaign.error}
                </div>
              ) : null}

              <div className="space-y-2">
                <Progress value={campaignProgress(data.campaign)} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Sent" value={data.counts.sent} tone="emerald" />
                  <Stat label="Pending" value={data.counts.pending + data.counts.sending} />
                  <Stat label="Failed" value={data.counts.failed} tone="rose" />
                  <Stat label="Skipped" value={data.counts.skipped} tone="amber" />
                </div>
              </div>

              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">Message</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">
                  {renderTemplateBody(
                    data.campaign.template_body,
                    data.recipients[0]?.variables ?? {},
                  ) || data.campaign.template_body}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Audience: {data.campaign.audience?.description ?? "Selected recipients"}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Recipients</p>
                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as CampaignRecipientStatus | "all")
                  }
                >
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {(
                      Object.keys(CAMPAIGN_RECIPIENT_STATUS_LABELS) as CampaignRecipientStatus[]
                    ).map((status) => (
                      <SelectItem key={status} value={status}>
                        {CAMPAIGN_RECIPIENT_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ul className="divide-y rounded-md border">
                {recipients.length === 0 ? (
                  <li className="p-6 text-center text-sm text-muted-foreground">
                    No recipients with this status.
                  </li>
                ) : (
                  recipients.map((recipient) => (
                    <li key={recipient.id} className="flex items-start gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {recipient.full_name || recipient.phone}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {recipient.phone}
                          {recipient.sent_at ? ` · ${formatSgtDateTime(recipient.sent_at)}` : ""}
                        </div>
                        {recipient.error ? (
                          <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
                            {recipient.error}
                          </p>
                        ) : null}
                        {recipient.skip_reason ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {CAMPAIGN_SKIP_REASON_LABELS[recipient.skip_reason] ??
                              recipient.skip_reason.replace(/_/g, " ")}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "border-0 shrink-0",
                          RECIPIENT_STATUS_STYLES[recipient.status],
                        )}
                      >
                        {CAMPAIGN_RECIPIENT_STATUS_LABELS[recipient.status]}
                      </Badge>
                    </li>
                  ))
                )}
              </ul>

              {data.recipients.length >= 500 ? (
                <p className="text-xs text-muted-foreground">
                  Showing the first 500 recipients.
                </p>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "rose" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "amber"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}
