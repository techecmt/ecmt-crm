"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export interface Conversation {
  id: string;
  channel: "whatsapp" | "messenger" | "website";
  provider: "meta" | "twilio";
  page_id: string | null;
  twilio_connection_id: string | null;
  external_user_id: string;
  phone: string | null;
  name: string | null;
  status: "open" | "pending" | "resolved" | "spam";
  assigned_user_id: string | null;
  mode: "agent" | "human";
  ai_agent_id: string | null;
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
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_role: "user" | "assistant" | null;
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

export interface TwilioWhatsAppTemplate {
  sid: string;
  friendlyName: string;
  language: string;
  body: string | null;
  variables: string[];
}

export type ConversationFilters = {
  channel?: "all" | "whatsapp" | "messenger" | "website";
  page_id?: string | "all";
  status?: "active" | "all" | "open" | "pending" | "resolved" | "spam";
  assigned_user_id?: string | "all" | "unassigned";
  mode?: "all" | "agent" | "human";
  provider?: "all" | "meta" | "twilio";
  unread?: "all" | "unread";
  needs_attention?: boolean;
  sort?: "latest" | "oldest_waiting" | "priority";
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
  if (filters.provider && filters.provider !== "all") {
    params.set("provider", filters.provider);
  }
  if (filters.unread === "unread") {
    params.set("unread", "true");
  }
  if (filters.needs_attention) {
    params.set("needs_attention", "true");
  }
  if (filters.sort && filters.sort !== "latest") {
    params.set("sort", filters.sort);
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
      return (await res.json()) as Conversation[];
    },
    refetchInterval: 30000,
  });
}

type MessagePage = {
  messages: Message[];
  nextCursor: string | null;
};

export function useMessages(conversationId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      const page = (await res.json()) as MessagePage;
      return page.messages;
    },
    enabled: !!conversationId,
    refetchInterval: 15000,
  });
}

export function useInfiniteMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: ["messages", conversationId, "infinite"],
    queryFn: async ({ pageParam }) => {
      if (!conversationId) return { messages: [], nextCursor: null } as MessagePage;
      const params = new URLSearchParams({ limit: "50" });
      if (pageParam) params.set("before", pageParam);
      const res = await fetch(`/api/conversations/${conversationId}/messages?${params}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return (await res.json()) as MessagePage;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!conversationId,
    refetchInterval: 15000,
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

export function useTwilioWhatsAppTemplates(
  conversationId: string | null,
  enabled = true,
) {
  return useQuery<TwilioWhatsAppTemplate[]>({
    queryKey: ["twilio-whatsapp-templates", conversationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (conversationId) params.set("conversation_id", conversationId);
      const query = params.toString();
      const res = await fetch(`/api/messaging/templates${query ? `?${query}` : ""}`);
      const data = (await res.json()) as {
        templates?: TwilioWhatsAppTemplate[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load Twilio templates");
      return data.templates ?? [];
    },
    enabled: enabled && !!conversationId,
    staleTime: 60_000,
  });
}

export function useSendTwilioTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      contentSid,
      variables,
    }: {
      conversationId: string;
      contentSid: string;
      variables: Record<string, string>;
    }) => {
      const res = await fetch(`/api/conversations/${conversationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: {
            content_sid: contentSid,
            variables,
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to send template");
      return data;
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
        read_state: "read" | "unread";
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

export function useSetConversationReadState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      state,
    }: {
      conversationId: string;
      state: "read" | "unread";
    }) => {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read_state: state }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Failed to update read state");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
