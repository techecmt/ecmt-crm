"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  BellDot,
  CircleAlert,
  Globe2,
  LinkIcon,
  MessageCircle,
  Search,
  User,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  useSetConversationReadState,
  type Conversation,
  type ConversationFilters,
} from "@/lib/hooks/use-conversations";
import { useRealtimeMessages } from "@/lib/hooks/use-realtime-messages";
import { useMessagingPages } from "@/lib/hooks/use-message-centre-settings";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { ConversationDetail } from "@/components/message-centre/conversation-detail";

const DEFAULT_FILTERS: ConversationFilters = {
  channel: "all",
  page_id: "all",
  status: "active",
  assigned_user_id: "all",
  mode: "all",
  provider: "all",
  unread: "all",
  needs_attention: false,
  sort: "latest",
};

export function MessageCentrePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState(() => searchParams.get("q") || "");
  const [filters, setFilters] = React.useState<ConversationFilters>(() => ({
    ...DEFAULT_FILTERS,
    status: (searchParams.get("status") as ConversationFilters["status"]) || "active",
    channel: (searchParams.get("channel") as ConversationFilters["channel"]) || "all",
    page_id: searchParams.get("page_id") || "all",
    assigned_user_id: searchParams.get("assigned_user_id") || "all",
    mode: (searchParams.get("mode") as ConversationFilters["mode"]) || "all",
    provider: (searchParams.get("provider") as ConversationFilters["provider"]) || "all",
    unread: searchParams.get("unread") === "true" ? "unread" : "all",
    needs_attention: searchParams.get("needs_attention") === "true",
    sort: (searchParams.get("sort") as ConversationFilters["sort"]) || "latest",
  }));

  const { data: conversations = [], isLoading } = useConversations(filters);
  const { data: pages = [] } = useMessagingPages();
  const { data: profiles = [] } = useProfiles();
  const { data: currentProfile } = useCurrentProfile();
  const setReadState = useSetConversationReadState();

  useRealtimeMessages(selectedId);

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (filters.channel !== "all") params.set("channel", filters.channel || "all");
    if (filters.page_id !== "all") params.set("page_id", filters.page_id || "all");
    if (filters.status !== "active") params.set("status", filters.status || "active");
    if (filters.assigned_user_id !== "all") {
      params.set("assigned_user_id", filters.assigned_user_id || "all");
    }
    if (filters.mode !== "all") params.set("mode", filters.mode || "all");
    if (filters.provider !== "all") params.set("provider", filters.provider || "all");
    if (filters.unread === "unread") params.set("unread", "true");
    if (filters.needs_attention) params.set("needs_attention", "true");
    if (filters.sort !== "latest") params.set("sort", filters.sort || "latest");

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [filters, pathname, router, searchParams, searchQuery]);

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
  const unreadCount = conversations.reduce(
    (total, conversation) => total + conversation.unread_count,
    0,
  );
  const needsAttentionCount = conversations.filter(
    (conversation) => conversation.lifecycle_status === "escalation_requested",
  ).length;

  const updateFilters = (updates: Partial<ConversationFilters>) => {
    setFilters((previous) => ({ ...previous, ...updates }));
  };

  const toggleUnread = () =>
    updateFilters({ unread: filters.unread === "unread" ? "all" : "unread" });
  const toggleAttention = () =>
    updateFilters({ needs_attention: !filters.needs_attention });
  const showMine = () =>
    updateFilters({
      assigned_user_id:
        currentProfile && filters.assigned_user_id !== currentProfile.id
          ? currentProfile.id
          : "all",
    });
  const showUnassigned = () =>
    updateFilters({
      assigned_user_id:
        filters.assigned_user_id === "unassigned" ? "all" : "unassigned",
    });

  const selectConversation = (conversation: Conversation) => {
    setSelectedId(conversation.id);
    if (conversation.unread_count > 0) {
      setReadState.mutate({ conversationId: conversation.id, state: "read" });
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[28rem] overflow-hidden rounded-lg border bg-background">
      <div
        className={cn(
          "w-full shrink-0 flex-col border-r md:flex md:w-[390px]",
          selectedConversation ? "hidden md:flex" : "flex",
        )}
      >
        <div className="flex items-center gap-2 border-b p-3">
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold">Message Centre</h2>
          <div className="ml-auto flex items-center gap-1.5">
            {unreadCount > 0 ? (
              <Badge className="bg-blue-600 hover:bg-blue-600">
                <BellDot className="mr-1 h-3 w-3" />
                {unreadCount}
              </Badge>
            ) : null}
            <Badge variant="secondary">{conversations.length}</Badge>
          </div>
        </div>

        <div className="space-y-2 border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, or message..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={filters.unread === "unread" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={toggleUnread}
            >
              <BellDot className="mr-1 h-3.5 w-3.5" />
              Unread
            </Button>
            <Button
              size="sm"
              variant={filters.needs_attention ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={toggleAttention}
            >
              <CircleAlert className="mr-1 h-3.5 w-3.5" />
              Attention{needsAttentionCount ? ` (${needsAttentionCount})` : ""}
            </Button>
            <Button
              size="sm"
              variant={
                currentProfile && filters.assigned_user_id === currentProfile.id
                  ? "default"
                  : "outline"
              }
              className="h-7 px-2 text-xs"
              onClick={showMine}
              disabled={!currentProfile}
            >
              Mine
            </Button>
            <Button
              size="sm"
              variant={filters.assigned_user_id === "unassigned" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={showUnassigned}
            >
              <UsersRound className="mr-1 h-3.5 w-3.5" />
              Unassigned
            </Button>
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
                <SelectItem value="website">Website chat</SelectItem>
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
                <SelectItem value="active">Open & pending</SelectItem>
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
            <Select
              value={filters.provider || "all"}
              onValueChange={(value) =>
                updateFilters({
                  provider: value as ConversationFilters["provider"],
                })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.sort || "latest"}
              onValueChange={(value) =>
                updateFilters({ sort: value as ConversationFilters["sort"] })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest message</SelectItem>
                <SelectItem value="oldest_waiting">Waiting longest</SelectItem>
                <SelectItem value="priority">Unread first</SelectItem>
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
                  onClick={() => selectConversation(conversation)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div
        className={cn(
          "flex-1 flex-col",
          selectedConversation ? "flex" : "hidden md:flex",
        )}
      >
        {selectedConversation ? (
          <ConversationDetail
            conversation={selectedConversation}
            onBack={() => setSelectedId(null)}
          />
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
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })
    : "";
  const isUnread = conversation.unread_count > 0;
  const previewPrefix =
    lastMsg?.role === "user" ? "Customer: " : lastMsg ? "You: " : "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        isActive && "bg-muted",
        isUnread && !isActive && "bg-blue-50/60 dark:bg-blue-950/20",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
        <User className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm font-medium", isUnread && "font-semibold")}>
            {displayName}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {isUnread ? (
              <span
                className="inline-flex min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white"
                aria-label={`${conversation.unread_count} unread messages`}
              >
                {conversation.unread_count}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
        </div>
        {lastMsg ? (
          <p className={cn("truncate text-xs text-muted-foreground", isUnread && "font-medium text-foreground")}>
            {previewPrefix}
            {lastMsg.content}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {conversation.channel === "whatsapp"
              ? "WA"
              : conversation.channel === "messenger"
                ? "MSG"
                : "WEB"}
          </Badge>
          {conversation.channel === "whatsapp" ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {conversation.provider === "twilio" ? "Twilio" : "Meta"}
            </Badge>
          ) : null}
          {conversation.channel === "website" ? (
            <Globe2 className="h-3 w-3 text-blue-600" aria-label="Website chat" />
          ) : null}
          {pageName ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {pageName}
            </Badge>
          ) : null}
          {conversation.status !== "open" ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {conversation.status}
            </Badge>
          ) : null}
          {conversation.lifecycle_status === "escalation_requested" ? (
            <Badge className="bg-amber-500 px-1.5 py-0 text-[10px] hover:bg-amber-500">
              Needs attention
            </Badge>
          ) : null}
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
