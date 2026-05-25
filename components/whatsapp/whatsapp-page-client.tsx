"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import {
  MessageSquare,
  User,
  Search,
  LinkIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useConversations,
  type Conversation,
} from "@/lib/hooks/use-conversations";
import { useRealtimeMessages } from "@/lib/hooks/use-realtime-messages";
import { ConversationDetail } from "./conversation-detail";

export function WhatsAppPageClient() {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  const { data: conversations = [], isLoading } = useConversations();

  // Subscribe to real-time updates
  useRealtimeMessages(selectedId);

  const filtered = React.useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.last_message?.content.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-background">
      {/* Sidebar - Conversation List */}
      <div className="flex w-80 shrink-0 flex-col border-r">
        <div className="flex items-center gap-2 border-b p-3">
          <MessageSquare className="h-5 w-5 text-green-600" />
          <h2 className="font-semibold">WhatsApp</h2>
          <Badge variant="secondary" className="ml-auto">
            {conversations.length}
          </Badge>
        </div>

        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              Loading conversations...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <MessageSquare className="mb-2 h-8 w-8 opacity-50" />
              <p>No conversations yet</p>
              <p className="text-xs">Messages will appear here when users send WhatsApp messages</p>
            </div>
          ) : (
            <div className="grid gap-px p-1">
              {filtered.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={selectedId === conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Panel */}
      <div className="flex flex-1 flex-col">
        {selectedConversation ? (
          <ConversationDetail conversation={selectedConversation} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm">Choose a conversation from the sidebar to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onClick,
}: {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const displayName = conversation.name || conversation.phone;
  const lastMsg = conversation.last_message;
  const timeAgo = conversation.updated_at
    ? formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })
    : "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        isActive && "bg-muted"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <User className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{displayName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {lastMsg && (
            <p className="truncate text-xs text-muted-foreground">
              {lastMsg.role === "assistant" && (
                <span className="font-medium text-green-600">AI: </span>
              )}
              {lastMsg.content}
            </p>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              conversation.mode === "agent"
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
            )}
          >
            {conversation.mode === "agent" ? "AI" : "Human"}
          </Badge>
          {conversation.lead_id && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              <LinkIcon className="mr-0.5 h-2.5 w-2.5" />
              Lead
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}
