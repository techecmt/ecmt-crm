"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();

    const inboxChannel = supabase
      .channel("message-centre-inbox-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    const threadChannel = conversationId
      ? supabase
          .channel(`message-centre-thread-${conversationId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${conversationId}`,
            },
            () => {
              queryClient.invalidateQueries({
                queryKey: ["messages", conversationId],
              });
            },
          )
          .subscribe()
      : null;

    return () => {
      supabase.removeChannel(inboxChannel);
      if (threadChannel) supabase.removeChannel(threadChannel);
    };
  }, [conversationId, queryClient]);
}
