"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type TemplateApprovalStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "received"
  | "unsubmitted"
  | "unknown";

export type WhatsAppTemplate = {
  sid: string;
  friendlyName: string;
  language: string;
  body: string | null;
  variables: string[];
  approvalStatus: TemplateApprovalStatus;
  approvalName: string | null;
  category: string | null;
  rejectionReason: string | null;
  contentType: string | null;
  dateCreated: string | null;
};

export const TEMPLATES_KEY = ["whatsapp-templates"] as const;

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error || fallback);
}

/** All Content templates on a connection, including drafts awaiting approval. */
export function useWhatsAppTemplates(connectionId: string | null, enabled = true) {
  return useQuery<WhatsAppTemplate[]>({
    queryKey: [...TEMPLATES_KEY, connectionId ?? "default"],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({ include_all: "1" });
      if (connectionId) params.set("connection_id", connectionId);
      const response = await fetch(`/api/messaging/templates?${params.toString()}`);
      if (!response.ok) throw await readError(response, "Failed to load templates");
      const payload = await response.json();
      return (payload.templates ?? []) as WhatsAppTemplate[];
    },
  });
}

export type CreateTemplateInput = {
  connectionId: string | null;
  friendlyName: string;
  language: string;
  body: string;
  variableSamples: Record<string, string>;
  submitForApproval: boolean;
  approvalName?: string;
  category?: "UTILITY" | "MARKETING" | "AUTHENTICATION";
};

export function useCreateWhatsAppTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const response = await fetch("/api/messaging/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw await readError(response, "Failed to create template");
      return response.json() as Promise<{
        template: WhatsAppTemplate;
        approvalSubmitted: boolean;
        approvalError: string | null;
      }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      if (result.approvalError) {
        toast.warning(`Template created, but approval failed: ${result.approvalError}`);
      } else if (result.approvalSubmitted) {
        toast.success("Template created and submitted to WhatsApp for approval");
      } else {
        toast.success("Template created as a draft");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSubmitTemplateForApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      connectionId: string | null;
      contentSid: string;
      approvalName: string;
      category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
    }) => {
      const response = await fetch("/api/messaging/templates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw await readError(response, "Failed to submit for approval");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      toast.success("Submitted to WhatsApp for approval");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteWhatsAppTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId: string | null; contentSid: string }) => {
      const params = new URLSearchParams({ sid: input.contentSid });
      if (input.connectionId) params.set("connection_id", input.connectionId);
      const response = await fetch(`/api/messaging/templates?${params.toString()}`, {
        method: "DELETE",
      });
      if (!response.ok) throw await readError(response, "Failed to delete template");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      toast.success("Template deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
