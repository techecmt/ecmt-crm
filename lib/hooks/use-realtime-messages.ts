"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import {
  type Conversation,
  type Message,
  applyConversationUnread,
  messageThreadQueryKey,
} from "@/lib/hooks/use-conversations";

export type RealtimeConnection = "connecting" | "live" | "polling";

type MessageRow = Message & {
  conversation_id: string;
};

type MessagePage = {
  messages: Message[];
  nextCursor: string | null;
};

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    whatsapp_msg_id: row.whatsapp_msg_id,
    external_msg_id: row.external_msg_id,
    sent_by_user_id: row.sent_by_user_id,
    created_at: row.created_at,
  };
}

function appendMessageToThread(queryClient: QueryClient, row: MessageRow) {
  const message = toMessage(row);
  queryClient.setQueryData<Message[]>(["messages", row.conversation_id], (current) => {
    if (!current) return current;
    if (current.some((item) => item.id === message.id)) return current;
    return [...current, message];
  });
  queryClient.setQueryData<InfiniteData<MessagePage>>(
    messageThreadQueryKey(row.conversation_id),
    (current) => {
      if (!current?.pages?.length) return current;

      const alreadyExists = current.pages.some((page) =>
        page.messages.some((item) => item.id === message.id),
      );
      if (alreadyExists) return current;

      const pages = current.pages.map((page, index) => {
        if (index !== 0) return page;
        return {
          ...page,
          messages: [...page.messages, message],
        };
      });
      return { ...current, pages };
    },
  );
}

function patchConversationLists(
  queryClient: QueryClient,
  row: MessageRow,
  selectedConversationId: string | null,
) {
  let found = false;

  queryClient.setQueriesData<Conversation[]>({ queryKey: ["conversations"] }, (list) => {
    if (!list) return list;
    const index = list.findIndex((conversation) => conversation.id === row.conversation_id);
    if (index < 0) return list;

    found = true;
    const current = list[index];
    const preview = row.content.slice(0, 280);
    const nextConversation: Conversation = {
      ...current,
      last_message_at: row.created_at,
      last_message_preview: preview,
      last_message_role: row.role,
      last_message: {
        content: row.content,
        role: row.role,
        created_at: row.created_at,
      },
      updated_at: row.created_at,
      unread_count:
        row.role === "user" && row.conversation_id !== selectedConversationId
          ? (current.unread_count ?? 0) + 1
          : current.unread_count,
    };

    const next = list.filter((conversation) => conversation.id !== row.conversation_id);
    next.unshift(nextConversation);
    return next;
  });

  return found;
}

export function useRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const selectedIdRef = useRef(conversationId);
  selectedIdRef.current = conversationId;
  const [connection, setConnection] = useState<RealtimeConnection>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let inboxRefreshTimer: number | null = null;

    const scheduleInboxRefresh = () => {
      if (inboxRefreshTimer) window.clearTimeout(inboxRefreshTimer);
      inboxRefreshTimer = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }, 250);
    };

    const channel = supabase
      .channel("message-centre-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!row?.id || !row.conversation_id) return;

          appendMessageToThread(queryClient, row);
          const foundInInbox = patchConversationLists(
            queryClient,
            row,
            selectedIdRef.current,
          );
          if (!foundInInbox) scheduleInboxRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          const row = payload.new as Partial<Conversation> & { id?: string };
          if (row?.id && typeof row.unread_count === "number") {
            applyConversationUnread(
              queryClient,
              row.id,
              row.id === selectedIdRef.current ? 0 : row.unread_count,
            );
          }
          scheduleInboxRefresh();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("polling");
        }
      });

    return () => {
      if (inboxRefreshTimer) window.clearTimeout(inboxRefreshTimer);
      setConnection("connecting");
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return connection;
}
