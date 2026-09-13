"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  BellDot,
  CircleAlert,
  Filter,
  Globe2,
  LinkIcon,
  MessageCircle,
  MessageCircleReply,
  Search,
  SlidersHorizontal,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useNowMs } from "@/lib/hooks/use-now";
import { ConversationDetail } from "@/components/message-centre/conversation-detail";
import {
  channelShortLabel,
  conversationSubtitle,
  conversationTitle,
  isWaitingForReply,
  lastMessagePrefix,
} from "@/lib/messaging/conversation-display";

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
  const now = useNowMs(30_000);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<Conversation | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = React.useState(() => searchParams.get("q") || "");
  const [waitingOnly, setWaitingOnly] = React.useState(
    () => searchParams.get("waiting") === "true",
  );
  const [filtersOpen, setFiltersOpen] = React.useState(false);
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

  const connection = useRealtimeMessages(selectedId);
  const isLive = connection === "live";
  const { data: conversations = [], isLoading, isFetching } = useConversations(
    filters,
    { isLive },
  );
  const { data: pages = [] } = useMessagingPages();
  const { data: profiles = [] } = useProfiles();
  const { data: currentProfile } = useCurrentProfile();
  const setReadState = useSetConversationReadState();

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (waitingOnly) params.set("waiting", "true");
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
  }, [filters, pathname, router, searchParams, searchQuery, waitingOnly]);

  const filteredBySearch = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (waitingOnly && !isWaitingForReply(conversation)) return false;
      if (!q) return true;
      const title = conversationTitle(conversation).toLowerCase();
      const subtitle = conversationSubtitle(conversation).toLowerCase();
      return (
        title.includes(q) ||
        subtitle.includes(q) ||
        conversation.name?.toLowerCase().includes(q) ||
        conversation.phone?.includes(q) ||
        conversation.external_user_id.toLowerCase().includes(q) ||
        conversation.visitor_data?.email?.toLowerCase().includes(q) ||
        conversation.last_message?.content.toLowerCase().includes(q)
      );
    });
  }, [conversations, searchQuery, waitingOnly]);

  const selectedFromList =
    conversations.find((conversation) => conversation.id === selectedId) || null;

  React.useEffect(() => {
    if (selectedFromList) setSelectedSnapshot(selectedFromList);
  }, [selectedFromList]);

  const selectedConversation =
    selectedFromList ??
    (selectedSnapshot?.id === selectedId ? selectedSnapshot : null);

  const unreadCount = conversations.reduce(
    (total, conversation) => total + conversation.unread_count,
    0,
  );
  const waitingCount = conversations.filter(isWaitingForReply).length;
  const needsAttentionCount = conversations.filter(
    (conversation) => conversation.lifecycle_status === "escalation_requested",
  ).length;
  const extraFilterCount = [
    filters.channel !== "all",
    filters.page_id !== "all",
    filters.status !== "active",
    filters.mode !== "all",
    filters.provider !== "all",
    filters.sort !== "latest",
    Boolean(
      filters.assigned_user_id &&
        filters.assigned_user_id !== "all" &&
        filters.assigned_user_id !== "unassigned" &&
        filters.assigned_user_id !== currentProfile?.id,
    ),
  ].filter(Boolean).length;

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
    setSelectedSnapshot(
      conversation.unread_count > 0
        ? { ...conversation, unread_count: 0 }
        : conversation,
    );
    if (conversation.unread_count > 0) {
      setReadState.mutate({ conversationId: conversation.id, state: "read" });
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[28rem] overflow-hidden rounded-lg border bg-background">
      <div
        className={cn(
          "w-full shrink-0 flex-col border-r md:flex md:w-[380px]",
          selectedConversation ? "hidden md:flex" : "flex",
        )}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold">Message Centre</h2>
          <LiveStatus connection={connection} syncing={isFetching && !isLoading} />
          <div className="ml-auto flex items-center gap-1.5">
            {unreadCount > 0 ? (
              <Badge className="bg-blue-600 hover:bg-blue-600">
                <BellDot className="mr-1 h-3 w-3" />
                {unreadCount}
              </Badge>
            ) : null}
            <Badge variant="secondary">{filteredBySearch.length}</Badge>
          </div>
        </div>

        <div className="space-y-2 border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search visitor, phone, email, or message"
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={waitingOnly ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setWaitingOnly((current) => !current)}
            >
              <MessageCircleReply className="mr-1 h-3.5 w-3.5" />
              Waiting{waitingCount ? ` (${waitingCount})` : ""}
            </Button>
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
            <Button
              size="sm"
              variant={filtersOpen || extraFilterCount > 0 ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
              Filters{extraFilterCount ? ` (${extraFilterCount})` : ""}
            </Button>
          </div>
          {filtersOpen ? (
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-2">
              <Select
                value={filters.channel || "all"}
                onValueChange={(value) =>
                  updateFilters({ channel: value as ConversationFilters["channel"] })
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
                onValueChange={(value) => updateFilters({ page_id: value })}
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
                  updateFilters({ status: value as ConversationFilters["status"] })
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
                  updateFilters({
                    assigned_user_id: value as ConversationFilters["assigned_user_id"],
                  })
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
                  updateFilters({ mode: value as ConversationFilters["mode"] })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modes</SelectItem>
                  <SelectItem value="agent">AI handling</SelectItem>
                  <SelectItem value="human">Human handling</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.provider || "all"}
                onValueChange={(value) =>
                  updateFilters({ provider: value as ConversationFilters["provider"] })
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
                <SelectTrigger className="h-8 col-span-2">
                  <Filter className="mr-1.5 h-3.5 w-3.5" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest message</SelectItem>
                  <SelectItem value="oldest_waiting">Waiting longest</SelectItem>
                  <SelectItem value="priority">Unread first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
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
                  now={now}
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
            isLive={isLive}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm">Open a chat to reply, assign, or convert it to a lead</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveStatus({
  connection,
  syncing,
}: {
  connection: ReturnType<typeof useRealtimeMessages>;
  syncing: boolean;
}) {
  const live = connection === "live";
  const label = live ? "Live" : connection === "connecting" ? "Connecting" : "Updating";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              live ? "bg-emerald-500" : "bg-amber-500",
              (syncing || !live) && "animate-pulse",
            )}
          />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {live
          ? "New visitor and counsellor messages appear immediately."
          : "Live updates are reconnecting. The inbox is refreshing every few seconds."}
      </TooltipContent>
    </Tooltip>
  );
}

function ConversationItem({
  conversation,
  pageName,
  assigneeName,
  isActive,
  now,
  onClick,
}: {
  conversation: Conversation;
  pageName: string | null;
  assigneeName: string | null;
  isActive: boolean;
  now: number;
  onClick: () => void;
}) {
  const displayName = conversationTitle(conversation);
  const lastMsg = conversation.last_message;
  const timeAgo =
    conversation.last_message_at && now
      ? formatDistanceToNow(new Date(conversation.last_message_at), {
          addSuffix: true,
        })
      : "";
  const isUnread = conversation.unread_count > 0;
  const waiting = isWaitingForReply(conversation);
  const prefix = lastMessagePrefix(lastMsg?.role);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        isActive
          ? "border-blue-600 bg-muted"
          : waiting
            ? "border-amber-500"
            : "border-transparent",
        isUnread && !isActive && "bg-blue-50/70 dark:bg-blue-950/20",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          waiting ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700",
        )}
      >
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
          <p
            className={cn(
              "truncate text-xs text-muted-foreground",
              (isUnread || waiting) && "font-medium text-foreground",
            )}
          >
            {prefix ? `${prefix}: ` : ""}
            {lastMsg.content}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {channelShortLabel(conversation.channel)}
          </Badge>
          {conversation.channel === "whatsapp" ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {conversation.provider === "twilio" ? "Twilio" : "Meta"}
            </Badge>
          ) : null}
          {conversation.channel === "website" ? (
            <Globe2 className="h-3 w-3 text-blue-600" aria-label="Website chat" />
          ) : null}
          {waiting ? (
            <Badge className="bg-amber-500 px-1.5 py-0 text-[10px] hover:bg-amber-500">
              Waiting
            </Badge>
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
