"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  isCampaignRunning,
  type CampaignAudienceSource,
  type CampaignCounts,
  type CampaignVariableMapping,
  type ManualRecipientEntry,
  type WhatsAppCampaign,
  type WhatsAppCampaignRecipient,
} from "@/lib/campaigns";

export const CAMPAIGNS_KEY = ["whatsapp-campaigns"] as const;

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error || fallback);
}

export function useCampaigns() {
  return useQuery<WhatsAppCampaign[]>({
    queryKey: CAMPAIGNS_KEY,
    queryFn: async () => {
      const response = await fetch("/api/messaging/campaigns");
      if (!response.ok) throw await readError(response, "Failed to load campaigns");
      const payload = await response.json();
      return (payload.campaigns ?? []) as WhatsAppCampaign[];
    },
    // A sending campaign advances batch by batch on the server.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((campaign) => isCampaignRunning(campaign.status))
        ? 5000
        : false,
  });
}

export type CampaignDetail = {
  campaign: WhatsAppCampaign;
  recipients: WhatsAppCampaignRecipient[];
  counts: CampaignCounts;
};

export function useCampaign(campaignId: string | null) {
  return useQuery<CampaignDetail>({
    queryKey: [...CAMPAIGNS_KEY, campaignId],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const response = await fetch(`/api/messaging/campaigns/${campaignId}`);
      if (!response.ok) throw await readError(response, "Failed to load campaign");
      return response.json() as Promise<CampaignDetail>;
    },
    refetchInterval: (query) =>
      query.state.data && isCampaignRunning(query.state.data.campaign.status) ? 3000 : false,
  });
}

export type CreateCampaignInput = {
  name: string;
  twilioConnectionId: string;
  contentSid: string;
  templateName: string;
  templateLanguage: string;
  templateBody: string | null;
  variableMapping: CampaignVariableMapping;
  audience: {
    source: CampaignAudienceSource;
    leadIds?: string[];
    conversationIds?: string[];
    manualEntries?: ManualRecipientEntry[];
    description?: string;
    filters?: Record<string, unknown>;
  };
  sendCap?: number | null;
  skipRecentDays?: number | null;
  costPerMessage?: number;
  currency?: string;
};

export type CreateCampaignResult = {
  campaign: WhatsAppCampaign;
  summary: {
    queued: number;
    skippedOptedOut: number;
    skippedRecentlyMessaged: number;
    skippedDuplicate: number;
    skippedInvalidPhone: number;
    skippedOverCap: number;
  };
};

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => {
      const response = await fetch("/api/messaging/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw await readError(response, "Failed to create campaign");
      return response.json() as Promise<CreateCampaignResult>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSendCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(`/api/messaging/campaigns/${campaignId}/send`, {
        method: "POST",
      });
      if (!response.ok) throw await readError(response, "Failed to start the campaign");
      return response.json() as Promise<{ ok: true; queued: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY });
      toast.success(`Sending to ${result.queued} recipient${result.queued === 1 ? "" : "s"}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCampaignAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campaignId: string; action: "pause" | "resume" | "cancel" }) => {
      const response = await fetch(`/api/messaging/campaigns/${input.campaignId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: input.action }),
      });
      if (!response.ok) throw await readError(response, "Failed to update the campaign");
      return response.json();
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY });
      const labels = { pause: "paused", resume: "resumed", cancel: "cancelled" } as const;
      toast.success(`Campaign ${labels[variables.action]}`);
      // Resuming needs a worker to pick the queue back up.
      if (variables.action === "resume") {
        void fetch(`/api/messaging/campaigns/${variables.campaignId}/run`, { method: "POST" });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(`/api/messaging/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw await readError(response, "Failed to delete the campaign");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY });
      toast.success("Campaign deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
