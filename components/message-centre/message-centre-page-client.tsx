"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { LinkIcon, MessageCircle, Search, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useConversations,
  type Conversation,
  type ConversationFilters,
} from "@/lib/hooks/use-conversations";
import { useRealtimeMessages } from "@/lib/hooks/use-realtime-messages";
import { useMessagingPages } from "@/lib/hooks/use-message-centre-settings";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { ConversationDetail } from "@/components/message-centre/conversation-detail";

const DEFAULT_FILTERS: ConversationFilters = {
  channel: "all",
  page_id: "all",
  status: "all",
  assigned_user_id: "all",
  mode: "all",
};

export function MessageCentrePageClient() {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filters, setFilters] = React.useState<ConversationFilters>(DEFAULT_FILTERS);

  const { data: conversations = [], isLoading } = useConversations(filters);
  const { data: pages = [] } = useMessagingPages();
  const { data: profiles = [] } = useProfiles();

  useRealtimeMessages(selectedId);

  const filteredBySearch = React.useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.external_user_id.includes(q) ||
        c.last_message?.content.toLowerCase().includes(q),
    );
  }, [conversations, searchQuery]);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedId) || null;

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-background">
      <div className="flex w-[390px] shrink-0 flex-col border-r">
        <div className="flex items-center gap-2 border-b p-3">
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold">Message Centre</h2>
          <Badge variant="secondary" className="ml-auto">
            {conversations.length}
          </Badge>
        </div>

        <div className="space-y-2 border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={filters.channel || "all"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  channel: value as ConversationFilters["channel"],
                }))
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="messenger">Messenger</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.page_id || "all"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  page_id: value,
                }))
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pages</SelectItem>
                {pages.map((page) => (
                  <SelectItem key={page.id} value={page.page_id}>
                    {page.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.status || "all"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  status: value as ConversationFilters["status"],
                }))
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="spam">Spam</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.assigned_user_id || "all"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  assigned_user_id: value as ConversationFilters["assigned_user_id"],
                }))
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.mode || "all"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  mode: value as ConversationFilters["mode"],
                }))
              }
            >
              <SelectTrigger className="h-8 col-span-2">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                <SelectItem value="agent">AI</SelectItem>
                <SelectItem value="human">Human</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              Loading conversations...
            </div>
          ) : filteredBySearch.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="mb-2 h-8 w-8 opacity-50" />
              <p>No conversations match</p>
            </div>
          ) : (
            <div className="grid gap-px p-1">
              {filteredBySearch.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  pageName={
                    pages.find((page) => page.page_id === conversation.page_id)?.name ||
                    null
                  }
                  assigneeName={
                    profiles.find((profile) => profile.id === conversation.assigned_user_id)
                      ?.full_name || null
                  }
                  isActive={selectedId === conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col">
        {selectedConversation ? (
          <ConversationDetail conversation={selectedConversation} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm">Choose one from the inbox to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  pageName,
  assigneeName,
  isActive,
  onClick,
}: {
  conversation: Conversation;
  pageName: string | null;
  assigneeName: string | null;
  isActive: boolean;
  onClick: () => void;
}) {
  const displayName =
    conversation.name || conversation.phone || conversation.external_user_id;
  const lastMsg = conversation.last_message;
  const timeAgo = conversation.updated_at
    ? formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })
    : "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        isActive && "bg-muted",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
        <User className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{displayName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo}</span>
        </div>
        {lastMsg ? (
          <p className="truncate text-xs text-muted-foreground">{lastMsg.content}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {conversation.channel === "whatsapp" ? "WA" : "MSG"}
          </Badge>
          {pageName ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {pageName}
            </Badge>
          ) : null}
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {conversation.status}
          </Badge>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {conversation.mode === "agent" ? "AI" : "Human"}
          </Badge>
          {assigneeName ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {assigneeName}
            </Badge>
          ) : null}
          {conversation.lead_id ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              <LinkIcon className="mr-0.5 h-2.5 w-2.5" />
              Lead
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}
