"use client";

import * as React from "react";
import { Bot, ChevronLeft, Send, User, UserCheck, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatSgtTime24 } from "@/lib/timezone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  useMessages,
  useUpdateMode,
  useSendMessage,
  type Conversation,
  type Message,
} from "@/lib/hooks/use-conversations";

interface ConversationDetailProps {
  conversation: Conversation;
  onBack?: () => void;
}

export function ConversationDetail({ conversation, onBack }: ConversationDetailProps) {
  const [inputValue, setInputValue] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { data: messages = [], isLoading: messagesLoading } = useMessages(
    conversation.id
  );
  const updateMode = useUpdateMode();
  const sendMessage = useSendMessage();

  // Scroll to bottom when messages change
  React.useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleModeToggle = (checked: boolean) => {
    const newMode = checked ? "human" : "agent";
    updateMode.mutate(
      { conversationId: conversation.id, mode: newMode },
      {
        onSuccess: () => {
          toast.success(
            `Switched to ${newMode === "human" ? "Human" : "AI Agent"} mode`
          );
        },
        onError: () => {
          toast.error("Failed to update mode");
        },
      }
    );
  };

  const handleSend = () => {
    const msg = inputValue.trim();
    if (!msg) return;

    sendMessage.mutate(
      { conversationId: conversation.id, message: msg },
      {
        onSuccess: () => {
          setInputValue("");
          inputRef.current?.focus();
        },
        onError: (err) => {
          toast.error(err.message || "Failed to send message");
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className="-ml-1 shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground md:hidden"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {conversation.name || conversation.phone}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{conversation.phone || "No phone collected"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                conversation.mode === "agent"
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                  : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
              )}
            >
              {conversation.mode === "agent" ? (
                <>
                  <Bot className="mr-1 h-3 w-3" /> AI Agent
                </>
              ) : (
                <>
                  <UserCheck className="mr-1 h-3 w-3" /> Human
                </>
              )}
            </Badge>
            <Switch
              checked={conversation.mode === "human"}
              onCheckedChange={handleModeToggle}
              disabled={updateMode.isPending}
            />
          </div>
        </div>
      </div>

      {/* Messages */}
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
            <p className="text-xs">Messages will appear here as they come in</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            placeholder={
              conversation.mode === "human"
                ? "Type a reply as human counselor..."
                : "Type a manual message (overrides AI)..."
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sendMessage.isPending}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!inputValue.trim() || sendMessage.isPending}
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {conversation.mode === "agent" && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            AI is auto-responding. Switch to Human mode to take over the conversation.
          </p>
        )}
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const time = formatSgtTime24(message.created_at);

  return (
    <div
      className={cn("flex", isUser ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[70%]",
          isUser
            ? "rounded-tl-sm bg-muted text-foreground"
            : "rounded-tr-sm bg-green-600 text-white dark:bg-green-700"
        )}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          {isUser ? (
            <span className="text-[10px] font-medium text-muted-foreground">
              Customer
            </span>
          ) : (
            <span className="text-[10px] font-medium text-green-100">
              AI / Counselor
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </p>
        <p
          className={cn(
            "mt-1 text-right text-[10px]",
            isUser ? "text-muted-foreground" : "text-green-200"
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}
