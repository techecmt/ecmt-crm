"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  ChevronLeft,
  Link2,
  Loader2,
  Phone,
  Send,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { formatSgtTime24 } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import {
  useConvertConversationToLead,
  useMessages,
  useSendMessage,
  useUpdateConversationMeta,
  useUpdateMode,
  type Conversation,
  type Message,
} from "@/lib/hooks/use-conversations";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { useMessagingPages } from "@/lib/hooks/use-message-centre-settings";

export function ConversationDetail({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack?: () => void;
}) {
  const [inputValue, setInputValue] = React.useState("");
  const [phoneValue, setPhoneValue] = React.useState(conversation.phone || "");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { data: messages = [], isLoading: messagesLoading } = useMessages(
    conversation.id,
  );
  const { data: profiles = [] } = useProfiles();
  const { data: pages = [] } = useMessagingPages();
  const updateMode = useUpdateMode();
  const sendMessage = useSendMessage();
  const updateMeta = useUpdateConversationMeta();
  const convertLead = useConvertConversationToLead();

  const assignees = profiles.filter(
    (p) =>
      p.is_active &&
      ["counsellor", "admission_manager", "management", "super_admin"].includes(
        p.role,
      ),
  );

  React.useEffect(() => {
    setPhoneValue(conversation.phone || "");
  }, [conversation.phone]);

  React.useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  const pageName =
    pages.find((p) => p.page_id === conversation.page_id)?.name || "Unknown page";
  const isPhoneValid = /^\+?[0-9]{7,15}$/.test(phoneValue.replace(/\s+/g, ""));

  return (
    <>
      <div className="border-b px-4 py-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to inbox
          </button>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">
              {conversation.name ||
                conversation.phone ||
                conversation.external_user_id}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {conversation.channel === "whatsapp" ? "WhatsApp" : "Messenger"}
              </Badge>
              {conversation.page_id ? <Badge variant="outline">{pageName}</Badge> : null}
              <span>{conversation.external_user_id}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                conversation.mode === "agent"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-orange-200 bg-orange-50 text-orange-700",
              )}
            >
              {conversation.mode === "agent" ? (
                <>
                  <Bot className="mr-1 h-3 w-3" /> AI
                </>
              ) : (
                <>
                  <UserCheck className="mr-1 h-3 w-3" /> Human
                </>
              )}
            </Badge>
            <Switch
              checked={conversation.mode === "human"}
              onCheckedChange={(checked) =>
                updateMode.mutate(
                  {
                    conversationId: conversation.id,
                    mode: checked ? "human" : "agent",
                  },
                  {
                    onError: () => toast.error("Failed to update mode"),
                  },
                )
              }
            />
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Select
            value={conversation.status}
            onValueChange={(value) =>
              updateMeta.mutate({
                conversationId: conversation.id,
                payload: {
                  status: value as Conversation["status"],
                },
              })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="spam">Spam</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={conversation.assigned_user_id || "unassigned"}
            onValueChange={(value) =>
              updateMeta.mutate({
                conversationId: conversation.id,
                payload: {
                  assigned_user_id: value === "unassigned" ? null : value,
                },
              })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignees.map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>
                  {assignee.full_name || assignee.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8"
              value={phoneValue}
              placeholder="Phone"
              onChange={(e) => setPhoneValue(e.target.value)}
              onBlur={() => {
                if (phoneValue !== (conversation.phone || "")) {
                  updateMeta.mutate({
                    conversationId: conversation.id,
                    payload: { phone: phoneValue || null },
                  });
                }
              }}
            />
          </div>

          {conversation.lead_id ? (
            <Button asChild variant="outline" className="h-8">
              <Link href={`/dashboard/leads/${conversation.lead_id}`}>
                <Link2 className="mr-1 h-3.5 w-3.5" />
                View lead
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-8"
              disabled={!isPhoneValid || convertLead.isPending}
              onClick={() =>
                convertLead.mutate(conversation.id, {
                  onSuccess: () => toast.success("Converted and linked to lead"),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              Convert to Lead
            </Button>
          )}
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messagesLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Bot className="mb-2 h-8 w-8 opacity-50" />
            <p>No messages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            placeholder={
              conversation.mode === "human"
                ? "Reply as human counselor..."
                : "Send manual message..."
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const message = inputValue.trim();
                if (!message) return;
                sendMessage.mutate(
                  { conversationId: conversation.id, message },
                  {
                    onSuccess: () => setInputValue(""),
                    onError: (error) => toast.error(error.message),
                  },
                );
              }
            }}
            disabled={sendMessage.isPending}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={() => {
              const message = inputValue.trim();
              if (!message) return;
              sendMessage.mutate(
                { conversationId: conversation.id, message },
                {
                  onSuccess: () => setInputValue(""),
                  onError: (error) => toast.error(error.message),
                },
              );
            }}
            disabled={!inputValue.trim() || sendMessage.isPending}
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isHumanAgent = !isUser && !!message.sent_by_user_id;
  const time = formatSgtTime24(message.created_at);

  return (
    <div className={cn("flex", isUser ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[70%]",
          isUser
            ? "rounded-tl-sm bg-muted text-foreground"
            : isHumanAgent
              ? "rounded-tr-sm bg-blue-600 text-white"
              : "rounded-tr-sm bg-green-600 text-white",
        )}
      >
        <div className="mb-0.5 flex items-center gap-1.5">
          {isUser ? (
            <span className="text-[10px] font-medium text-muted-foreground">
              Customer
            </span>
          ) : (
            <span className="text-[10px] font-medium text-white/85">
              {isHumanAgent ? "Counselor" : "AI"}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        <p className="mt-1 text-right text-[10px] text-white/70">{time}</p>
      </div>
    </div>
  );
}
