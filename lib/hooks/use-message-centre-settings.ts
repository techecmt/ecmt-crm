"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AIAgent = {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  persona: string;
  tone: "professional_friendly" | "formal" | "casual" | "empathetic";
  greeting_message: string;
  fallback_message: string;
  escalation_enabled: boolean;
  escalation_keywords: string[];
  escalation_message: string;
  auto_collect_lead: boolean;
  lead_collect_fields: string[];
  business_hours_enabled: boolean;
  business_hours: {
    timezone: string;
    days: Record<string, { start: string; end: string }>;
  };
  offline_message: string;
  response_delay_ms: number;
  max_history_messages: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type AISettings = AIAgent;

export type AIKnowledge = {
  id: string;
  agent_id: string;
  title: string;
  content: string;
  is_active: boolean;
  sort_order: number;
  category: string;
  created_at: string;
};

export type MessagingPage = {
  id: string;
  agent_id: string;
  name: string;
  page_id: string;
  phone_number_id: string | null;
  channel: "messenger" | "whatsapp";
  is_active: boolean;
  description: string;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TwilioConnection = {
  id: string;
  agent_id: string;
  name: string;
  account_sid: string;
  auth_token: string;
  whatsapp_from: string | null;
  messaging_service_sid: string | null;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function useAIAgents() {
  return useQuery<AIAgent[]>({
    queryKey: ["ai-agents"],
    queryFn: async () => {
      const res = await fetch("/api/ai/agents");
      if (!res.ok) throw new Error("Failed to fetch AI agents");
      return res.json();
    },
  });
}

export function useCreateAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<AIAgent> & { name: string }) => {
      const res = await fetch("/api/ai/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create AI agent");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
    },
  });
}

export function useUpdateAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string } & Partial<AIAgent>) => {
      const res = await fetch("/api/ai/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update AI agent");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
    },
  });
}

export function useDeleteAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/ai/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete AI agent");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["messaging-pages"] });
      queryClient.invalidateQueries({ queryKey: ["twilio-connections"] });
    },
  });
}

export function useAISettings(agentId?: string | null) {
  return useQuery<AISettings>({
    queryKey: ["ai-settings", agentId ?? "default"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (agentId) params.set("agent_id", agentId);
      const query = params.toString();
      const res = await fetch(`/api/ai/settings${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch AI settings");
      return res.json();
    },
  });
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { agent_id: string } & Partial<AISettings>) => {
      const res = await fetch("/api/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update AI settings");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });
}

export function useAIKnowledge(agentId?: string | null) {
  return useQuery<AIKnowledge[]>({
    queryKey: ["ai-knowledge", agentId ?? "default"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (agentId) params.set("agent_id", agentId);
      const query = params.toString();
      const res = await fetch(`/api/ai/knowledge${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch knowledge");
      return res.json();
    },
  });
}

export function useSaveKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id?: string;
      payload: Partial<AIKnowledge> & {
        title: string;
        content: string;
        agent_id: string;
      };
    }) => {
      const endpoint = id ? `/api/ai/knowledge/${id}` : "/api/ai/knowledge";
      const method = id ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save knowledge");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] }),
  });
}

export function useDeleteKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete knowledge");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] }),
  });
}

export function useMessagingPages(agentId?: string | null) {
  return useQuery<MessagingPage[]>({
    queryKey: ["messaging-pages", agentId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (agentId) params.set("agent_id", agentId);
      const query = params.toString();
      const res = await fetch(`/api/messaging/pages${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch pages");
      return res.json();
    },
  });
}

export function useCreateMessagingPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      agent_id: string;
      name: string;
      page_id: string;
      access_token: string;
      channel?: "messenger" | "whatsapp";
      phone_number_id?: string;
      description?: string;
      is_active?: boolean;
    }) => {
      const res = await fetch("/api/messaging/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to add page");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messaging-pages"] }),
  });
}

export function useUpdateMessagingPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      agent_id?: string;
      name?: string;
      page_id?: string;
      access_token?: string;
      phone_number_id?: string;
      description?: string;
      is_active?: boolean;
    }) => {
      const res = await fetch("/api/messaging/pages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update page");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messaging-pages"] }),
  });
}

export function useDeleteMessagingPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/messaging/pages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete page");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messaging-pages"] }),
  });
}

export function useTwilioConnections(agentId?: string | null) {
  return useQuery<TwilioConnection[]>({
    queryKey: ["twilio-connections", agentId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (agentId) params.set("agent_id", agentId);
      const query = params.toString();
      const res = await fetch(
        `/api/messaging/twilio-connections${query ? `?${query}` : ""}`,
      );
      if (!res.ok) throw new Error("Failed to fetch Twilio connections");
      return res.json();
    },
  });
}

export function useCreateTwilioConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      agent_id: string;
      name: string;
      account_sid: string;
      auth_token: string;
      whatsapp_from?: string;
      messaging_service_sid?: string;
      description?: string;
      is_active?: boolean;
    }) => {
      const res = await fetch("/api/messaging/twilio-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to add Twilio connection");
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["twilio-connections"] }),
  });
}

export function useUpdateTwilioConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      agent_id?: string;
      name?: string;
      account_sid?: string;
      auth_token?: string;
      whatsapp_from?: string;
      messaging_service_sid?: string;
      description?: string;
      is_active?: boolean;
    }) => {
      const res = await fetch("/api/messaging/twilio-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update Twilio connection");
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["twilio-connections"] }),
  });
}

export function useDeleteTwilioConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/messaging/twilio-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete Twilio connection");
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["twilio-connections"] }),
  });
}
