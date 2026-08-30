"use client";

import { useQuery } from "@tanstack/react-query";

export type LeadConversationMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sent_by_user_id: string | null;
  created_at: string;
  sender: {
    full_name: string | null;
    email: string;
  } | null;
};

export type LeadConversation = {
  id: string;
  channel: "website" | "whatsapp" | "messenger";
  provider: "meta" | "twilio" | "whatsapp_web";
  external_user_id: string;
  name: string | null;
  created_at: string;
  updated_at: string;
  messages: LeadConversationMessage[];
};

export function useLeadMessages(leadId: string | undefined) {
  return useQuery<LeadConversation[]>({
    queryKey: ["leads", leadId, "messages"],
    enabled: !!leadId,
    queryFn: async () => {
      const response = await fetch(`/api/leads/${leadId}/messages`);
      const payload = (await response.json()) as LeadConversation[] & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load lead messages");
      }
      return payload;
    },
  });
}
