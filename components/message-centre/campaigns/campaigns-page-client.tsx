"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CampaignBuilder } from "@/components/message-centre/campaigns/campaign-builder";
import { CampaignDetailSheet } from "@/components/message-centre/campaigns/campaign-detail-sheet";
import {
  useCampaignAction,
  useCampaigns,
  useDeleteCampaign,
  useSendCampaign,
} from "@/lib/hooks/use-campaigns";
import {
  CAMPAIGN_STATUS_LABELS,
  campaignProgress,
  isCampaignRunning,
  type CampaignStatus,
  type WhatsAppCampaign,
} from "@/lib/campaigns";
import { formatSgtDateTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  queued: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  sending: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  cancelled: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

export function CampaignsPageClient() {
  const { data: campaigns = [], isLoading, isFetching, error, refetch } = useCampaigns();
  const sendCampaign = useSendCampaign();
  const campaignAction = useCampaignAction();
  const deleteCampaign = useDeleteCampaign();

  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WhatsAppCampaign | null>(null);

  const running = campaigns.filter((campaign) => isCampaignRunning(campaign.status)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Send an approved WhatsApp template to a list of leads or existing conversations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Refresh campaigns"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
          <Button onClick={() => setBuilderOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New campaign
          </Button>
        </div>
      </div>

      {running > 0 ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          {running} campaign{running === 1 ? "" : "s"} sending right now. Progress updates
          automatically.
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error.message}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
          <Megaphone className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No campaigns yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Bulk WhatsApp messages need a template approved by Meta. Create one under Message
            Centre settings, then build your first campaign here.
          </p>
          <Button className="mt-4" onClick={() => setBuilderOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New campaign
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Card
                className="cursor-pointer transition-colors hover:border-foreground/20"
                onClick={() => setDetailId(campaign.id)}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{campaign.name}</span>
                        <Badge
                          variant="secondary"
                          className={cn("border-0", STATUS_STYLES[campaign.status])}
                        >
                          {CAMPAIGN_STATUS_LABELS[campaign.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {campaign.template_name || campaign.content_sid} ·{" "}
                        {campaign.total_recipients} recipient
                        {campaign.total_recipients === 1 ? "" : "s"} ·{" "}
                        {formatSgtDateTime(campaign.created_at)}
                      </p>
                      {campaign.error ? (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {campaign.error}
                        </p>
                      ) : null}
                    </div>

                    <div
                      className="flex items-center gap-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {campaign.status === "draft" ? (
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={sendCampaign.isPending}
                          onClick={() => sendCampaign.mutate(campaign.id)}
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          Send
                        </Button>
                      ) : null}
                      {isCampaignRunning(campaign.status) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() =>
                            campaignAction.mutate({ campaignId: campaign.id, action: "pause" })
                          }
                        >
                          <Pause className="mr-1.5 h-3.5 w-3.5" />
                          Pause
                        </Button>
                      ) : null}
                      {campaign.status === "paused" ? (
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            campaignAction.mutate({ campaignId: campaign.id, action: "resume" })
                          }
                        >
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          Resume
                        </Button>
                      ) : null}
                      {isCampaignRunning(campaign.status) || campaign.status === "paused" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() =>
                            campaignAction.mutate({ campaignId: campaign.id, action: "cancel" })
                          }
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${campaign.name}`}
                          onClick={() => setDeleteTarget(campaign)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {campaign.status !== "draft" ? (
                    <CampaignProgressBar campaign={campaign} />
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Mounted only while open so its lead and conversation queries stay idle. */}
      {builderOpen ? (
        <CampaignBuilder open onOpenChange={setBuilderOpen} />
      ) : null}
      <CampaignDetailSheet campaignId={detailId} onClose={() => setDetailId(null)} />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              The send record for {deleteTarget?.name} will be removed permanently. Messages
              already delivered stay in the inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteCampaign.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CampaignProgressBar({ campaign }: { campaign: WhatsAppCampaign }) {
  const progress = campaignProgress(campaign);
  const finished =
    campaign.status === "completed" ||
    campaign.status === "cancelled" ||
    campaign.status === "failed";

  return (
    <div className="space-y-1.5">
      <Progress value={finished ? 100 : progress} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-2">
          {finished ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {CAMPAIGN_STATUS_LABELS[campaign.status]}
            </span>
          ) : (
            <span>{progress}% complete</span>
          )}
          <span>{campaign.sent_count} sent</span>
          {campaign.failed_count > 0 ? (
            <span className="text-rose-600 dark:text-rose-400">
              {campaign.failed_count} failed
            </span>
          ) : null}
          {campaign.skipped_count > 0 ? <span>{campaign.skipped_count} skipped</span> : null}
        </span>
        <span>
          {campaign.total_recipients} recipient{campaign.total_recipients === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
