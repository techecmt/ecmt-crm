"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Bot,
  ChevronLeft,
  CircleCheck,
  FileText,
  Link2,
  Loader2,
  MessageSquareMore,
  Phone,
  Send,
  UserCheck,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useInfiniteMessages,
  useSendMessage,
  useSendTwilioTemplate,
  useSetConversationReadState,
  useTwilioWhatsAppTemplates,
  useUpdateConversationMeta,
  useUpdateMode,
  type Conversation,
  type Message,
  type TwilioWhatsAppTemplate,
} from "@/lib/hooks/use-conversations";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { useMessagingPages } from "@/lib/hooks/use-message-centre-settings";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

export function ConversationDetail({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack?: () => void;
}) {
  const [inputValue, setInputValue] = React.useState("");
  const [phoneValue, setPhoneValue] = React.useState(conversation.phone || "");
  const [templateDialogOpen, setTemplateDialogOpen] = React.useState(false);
  const [selectedTemplateSid, setSelectedTemplateSid] = React.useState("");
  const [templateVariables, setTemplateVariables] = React.useState<Record<string, string>>(
    {},
  );
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const {
    data: messagePages,
    isLoading: messagesLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteMessages(conversation.id);
  const { data: profiles = [] } = useProfiles();
  const { data: pages = [] } = useMessagingPages();
  const { data: currentProfile } = useCurrentProfile();
  const updateMode = useUpdateMode();
  const sendMessage = useSendMessage();
  const updateMeta = useUpdateConversationMeta();
  const setReadState = useSetConversationReadState();
  const sendTemplate = useSendTwilioTemplate();
  const convertLead = useConvertConversationToLead();
  const isTwilioWhatsApp =
    conversation.channel === "whatsapp" && conversation.provider === "twilio";
  const {
    data: templates = [],
    isLoading: templatesLoading,
    error: templatesError,
  } = useTwilioWhatsAppTemplates(
    conversation.id,
    templateDialogOpen && isTwilioWhatsApp,
  );
  const messages = React.useMemo(
    () =>
      (messagePages?.pages ?? [])
        .slice()
        .reverse()
        .flatMap((page) => page.messages),
    [messagePages],
  );
  const hasInitialScrolled = React.useRef(false);
  const isNearBottom = React.useRef(true);
  const previousScroll = React.useRef<{ top: number; height: number } | null>(null);
  const lastAutoReadKey = React.useRef<string | null>(null);

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
    hasInitialScrolled.current = false;
    isNearBottom.current = true;
  }, [conversation.id]);

  React.useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;

    const updateScrollPosition = () => {
      isNearBottom.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
    };
    viewport.addEventListener("scroll", updateScrollPosition, { passive: true });
    updateScrollPosition();

    return () => viewport.removeEventListener("scroll", updateScrollPosition);
  }, []);

  React.useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport || messagesLoading) return;

    if (previousScroll.current) {
      const { top, height } = previousScroll.current;
      viewport.scrollTop = top + (viewport.scrollHeight - height);
      previousScroll.current = null;
      return;
    }

    if (!hasInitialScrolled.current || isNearBottom.current) {
      viewport.scrollTop = viewport.scrollHeight;
      hasInitialScrolled.current = true;
    }
  }, [messages, messagesLoading]);

  React.useEffect(() => {
    if (conversation.unread_count <= 0) {
      lastAutoReadKey.current = null;
      return;
    }

    // Prevent repeated PATCH loops for the same unread snapshot while the
    // detail pane stays open and idle.
    const attemptKey = `${conversation.id}:${conversation.unread_count}`;
    if (lastAutoReadKey.current === attemptKey || setReadState.isPending) return;

    lastAutoReadKey.current = attemptKey;
    setReadState.mutate(
      { conversationId: conversation.id, state: "read" },
      {
        onError: () => {
          lastAutoReadKey.current = null;
        },
      },
    );
  }, [
    conversation.id,
    conversation.unread_count,
    setReadState.isPending,
    setReadState,
  ]);

  const pageName =
    pages.find((p) => p.page_id === conversation.page_id)?.name || "Unknown page";
  const isPhoneValid = /^\+?[0-9]{7,15}$/.test(phoneValue.replace(/\s+/g, ""));

  const loadOlderMessages = () => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport) {
      previousScroll.current = {
        top: viewport.scrollTop,
        height: viewport.scrollHeight,
      };
    }
    fetchNextPage();
  };

  const selectedTemplate = templates.find((template) => template.sid === selectedTemplateSid);

  const selectTemplate = (template: TwilioWhatsAppTemplate) => {
    setSelectedTemplateSid(template.sid);
    setTemplateVariables(
      Object.fromEntries(template.variables.map((variable) => [variable, ""])),
    );
  };

  const sendSelectedTemplate = () => {
    if (!selectedTemplate) return;
    const missingVariable = selectedTemplate.variables.find(
      (variable) => !templateVariables[variable]?.trim(),
    );
    if (missingVariable) {
      toast.error(`Enter a value for ${missingVariable}`);
      return;
    }

    sendTemplate.mutate(
      {
        conversationId: conversation.id,
        contentSid: selectedTemplate.sid,
        variables: templateVariables,
      },
      {
        onSuccess: () => {
          setTemplateDialogOpen(false);
          setSelectedTemplateSid("");
          setTemplateVariables({});
          toast.success("Template sent");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const assignToMe = () => {
    if (!currentProfile) return;
    updateMeta.mutate(
      {
        conversationId: conversation.id,
        payload: { assigned_user_id: currentProfile.id },
      },
      {
        onSuccess: () => toast.success("Conversation assigned to you"),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const takeOverConversation = () => {
    if (!currentProfile) return;
    updateMeta.mutate(
      {
        conversationId: conversation.id,
        payload: { assigned_user_id: currentProfile.id },
      },
      {
        onSuccess: () =>
          updateMode.mutate(
            { conversationId: conversation.id, mode: "human" },
            {
              onSuccess: () => toast.success("You are now handling this conversation"),
              onError: (error) => toast.error(error.message),
            },
          ),
        onError: (error) => toast.error(error.message),
      },
    );
  };

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
                {conversation.channel === "whatsapp"
                  ? "WhatsApp"
                  : conversation.channel === "messenger"
                    ? "Messenger"
                    : "Website chat"}
              </Badge>
              {conversation.channel === "whatsapp" ? (
                <Badge variant="outline">
                  {conversation.provider === "twilio" ? "Twilio" : "Meta"}
                </Badge>
              ) : null}
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
            {conversation.lifecycle_status ? (
              <Badge
                variant={conversation.lifecycle_status === "escalation_requested" ? "default" : "outline"}
                className={
                  conversation.lifecycle_status === "escalation_requested"
                    ? "bg-amber-500 hover:bg-amber-500"
                    : undefined
                }
              >
                {conversation.lifecycle_status.replace(/_/g, " ")}
              </Badge>
            ) : null}
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

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={assignToMe}
            disabled={!currentProfile || updateMeta.isPending}
          >
            <UserRoundPlus className="mr-1.5 h-3.5 w-3.5" />
            Assign to me
          </Button>
          {conversation.lifecycle_status === "escalation_requested" ? (
            <Button
              size="sm"
              className="h-8"
              onClick={takeOverConversation}
              disabled={!currentProfile || updateMeta.isPending || updateMode.isPending}
            >
              <CircleCheck className="mr-1.5 h-3.5 w-3.5" />
              Take over
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() =>
              setReadState.mutate(
                {
                  conversationId: conversation.id,
                  state: conversation.unread_count > 0 ? "read" : "unread",
                },
                {
                  onSuccess: () =>
                    toast.success(
                      conversation.unread_count > 0
                        ? "Conversation marked read"
                        : "Conversation marked unread",
                    ),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
            disabled={setReadState.isPending}
          >
            <MessageSquareMore className="mr-1.5 h-3.5 w-3.5" />
            {conversation.unread_count > 0 ? "Mark read" : "Mark unread"}
          </Button>
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
        {conversation.channel === "website" && conversation.visitor_data ? (
          <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs">
            <p className="font-medium text-foreground">Captured website visitor details</p>
            <div className="mt-1 grid gap-1 text-muted-foreground sm:grid-cols-2">
              <span>Email: {conversation.visitor_data.email || "Not provided"}</span>
              <span>Phone: {conversation.visitor_data.phone || "Not provided"}</span>
              <span>
                Courses: {conversation.visitor_data.interested_courses?.join(", ") || "Not provided"}
              </span>
              <span>
                Qualification: {conversation.visitor_data.qualified ? "Qualified" : "Not qualified yet"}
              </span>
            </div>
            {conversation.source_url ? (
              <p className="mt-1 truncate text-muted-foreground" title={conversation.source_url}>
                Page: {conversation.source_url}
              </p>
            ) : null}
          </div>
        ) : null}
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
            {hasNextPage ? (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadOlderMessages}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Load older messages
                </Button>
              </div>
            ) : null}
            {messages.map((message, index) => (
              <React.Fragment key={message.id}>
                {shouldShowDateDivider(messages[index - 1], message) ? (
                  <DateDivider date={message.created_at} />
                ) : null}
                <MessageBubble message={message} />
              </React.Fragment>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          {isTwilioWhatsApp ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 px-2.5"
              onClick={() => setTemplateDialogOpen(true)}
              title="Send approved WhatsApp template"
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Template
            </Button>
          ) : null}
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
                    onSuccess: () => {
                      setInputValue("");
                      toast.success("Message sent");
                    },
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
                  onSuccess: () => {
                    setInputValue("");
                    toast.success("Message sent");
                  },
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

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send WhatsApp template</DialogTitle>
            <DialogDescription>
              Only templates approved for your Twilio WhatsApp sender are shown.
            </DialogDescription>
          </DialogHeader>

          {templatesLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading approved templates...
            </div>
          ) : templatesError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {templatesError.message}
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
              No approved Twilio WhatsApp templates were found. Create or submit one in
              Twilio Content Template Builder, then reopen this dialog.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="twilio-template">
                  Approved template
                </label>
                <Select
                  value={selectedTemplateSid}
                  onValueChange={(sid) => {
                    const template = templates.find((item) => item.sid === sid);
                    if (template) selectTemplate(template);
                  }}
                >
                  <SelectTrigger id="twilio-template">
                    <SelectValue placeholder="Select an approved template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.sid} value={template.sid}>
                        {template.friendlyName} ({template.language})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate?.body ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  {selectedTemplate.body}
                </div>
              ) : null}

              {selectedTemplate?.variables.map((variable) => (
                <div className="space-y-2" key={variable}>
                  <label className="text-sm font-medium" htmlFor={`template-variable-${variable}`}>
                    Variable {variable}
                  </label>
                  <Input
                    id={`template-variable-${variable}`}
                    value={templateVariables[variable] || ""}
                    onChange={(event) =>
                      setTemplateVariables((previous) => ({
                        ...previous,
                        [variable]: event.target.value,
                      }))
                    }
                    placeholder={`Value for {{${variable}}}`}
                  />
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTemplateDialogOpen(false)}
              disabled={sendTemplate.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={sendSelectedTemplate}
              disabled={!selectedTemplate || sendTemplate.isPending}
            >
              {sendTemplate.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Send template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function shouldShowDateDivider(previous: Message | undefined, message: Message) {
  if (!previous) return true;
  return new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
}

function DateDivider({ date }: { date: string }) {
  const day = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const label =
    day.toDateString() === today.toDateString()
      ? "Today"
      : day.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : format(day, "EEEE, MMMM d");

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
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
        <p
          className={cn(
            "mt-1 text-right text-[10px]",
            isUser ? "text-muted-foreground" : "text-white/70",
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}
