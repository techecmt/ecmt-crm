"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Conversation {
  id: string;
  channel: "whatsapp" | "messenger" | "website";
  page_id: string | null;
  external_user_id: string;
  phone: string | null;
  name: string | null;
  status: "open" | "pending" | "resolved" | "spam";
  assigned_user_id: string | null;
  mode: "agent" | "human";
  lead_id: string | null;
  lifecycle_status:
    | "new"
    | "bot_handled"
    | "escalation_requested"
    | "human_handled"
    | "closed"
    | null;
  bot_enabled: boolean;
  visitor_data: {
    name?: string;
    email?: string;
    phone?: string;
    interested_courses?: string[];
    qualified?: boolean;
  } | null;
  source_url: string | null;
  updated_at: string;
  created_at: string;
  last_message: {
    content: string;
    role: string;
    created_at: string;
  } | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  whatsapp_msg_id: string | null;
  external_msg_id: string | null;
  sent_by_user_id: string | null;
  created_at: string;
}

export type ConversationFilters = {
  channel?: "all" | "whatsapp" | "messenger" | "website";
  page_id?: string | "all";
  status?: "all" | "open" | "pending" | "resolved" | "spam";
  assigned_user_id?: string | "all" | "unassigned";
  mode?: "all" | "agent" | "human";
};

function toQueryString(filters: ConversationFilters) {
  const params = new URLSearchParams();
  if (filters.channel && filters.channel !== "all") {
    params.set("channel", filters.channel);
  }
  if (filters.page_id && filters.page_id !== "all") {
    params.set("page_id", filters.page_id);
  }
  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.mode && filters.mode !== "all") {
    params.set("mode", filters.mode);
  }
  if (filters.assigned_user_id && filters.assigned_user_id !== "all") {
    params.set("assigned_user_id", filters.assigned_user_id);
  }
  return params.toString();
}

export function useConversations(filters: ConversationFilters = {}) {
  return useQuery<Conversation[]>({
    queryKey: ["conversations", filters],
    queryFn: async () => {
      const qs = toQueryString(filters);
      const res = await fetch(`/api/conversations${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const conversations = (await res.json()) as Conversation[];
      return conversations.sort((a, b) => {
        const aPriority = a.lifecycle_status === "escalation_requested" ? 0 : 1;
        const bPriority = b.lifecycle_status === "escalation_requested" ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    },
    refetchInterval: 10000,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!conversationId,
    refetchInterval: 5000,
  });
}

export function useUpdateMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      mode,
    }: {
      conversationId: string;
      mode: "agent" | "human";
    }) => {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Failed to update mode");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      message,
    }: {
      conversationId: string;
      message: string;
    }) => {
      const res = await fetch(`/api/conversations/${conversationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["messages", variables.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useLinkLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      leadId,
    }: {
      conversationId: string;
      leadId: string | null;
    }) => {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      if (!res.ok) throw new Error("Failed to link lead");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUpdateConversationMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      payload,
    }: {
      conversationId: string;
      payload: Partial<{
        status: Conversation["status"];
        assigned_user_id: string | null;
        phone: string | null;
      }>;
    }) => {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Failed to update conversation");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversations", vars.conversationId] });
    },
  });
}

export function useConvertConversationToLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch(`/api/conversations/${conversationId}/convert-lead`, {
        method: "POST",
      });
      const payload = (await res.json()) as { error?: string; lead_id?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to convert lead");
      return payload;
    },
    onSuccess: (_data, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversations", conversationId] });
    },
  });
}
