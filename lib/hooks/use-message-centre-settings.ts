"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AISettings = {
  id: boolean;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  agent_name: string;
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
  updated_at: string;
};

export type AIKnowledge = {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  sort_order: number;
  category: string;
  created_at: string;
};

export type MessagingPage = {
  id: string;
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

export function useAISettings() {
  return useQuery<AISettings>({
    queryKey: ["ai-settings"],
    queryFn: async () => {
      const res = await fetch("/api/ai/settings");
      if (!res.ok) throw new Error("Failed to fetch AI settings");
      return res.json();
    },
  });
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<AISettings>) => {
      const res = await fetch("/api/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update AI settings");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-settings"] }),
  });
}

export function useAIKnowledge() {
  return useQuery<AIKnowledge[]>({
    queryKey: ["ai-knowledge"],
    queryFn: async () => {
      const res = await fetch("/api/ai/knowledge");
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
      payload: Partial<AIKnowledge> & { title: string; content: string };
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

export function useMessagingPages() {
  return useQuery<MessagingPage[]>({
    queryKey: ["messaging-pages"],
    queryFn: async () => {
      const res = await fetch("/api/messaging/pages");
      if (!res.ok) throw new Error("Failed to fetch pages");
      return res.json();
    },
  });
}

export function useCreateMessagingPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
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
