"use client";

import * as React from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type WidgetSession = {
  conversationId: string;
  token: string;
};

type WidgetMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

const STORAGE_KEY = "ecmt-website-chat-session";
const AGENT_NAME = "ESRA";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function WebsiteWidgetClient() {
  const [session, setSession] = React.useState<WidgetSession | null>(null);
  const [messages, setMessages] = React.useState<WidgetMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as WidgetSession;
        if (parsed.conversationId && parsed.token) setSession(parsed);
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; session?: WidgetSession };
      if (
        data?.type !== "ecmt-widget-session" ||
        !data.session?.conversationId ||
        !data.session.token
      ) {
        return;
      }
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.session));
      setSession(data.session);
      setError(null);
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "ecmt-widget-ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const loadMessages = React.useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/public/widget/conversations/${session.conversationId}/messages`,
        { headers: { Authorization: `Bearer ${session.token}` } },
      );
      const payload = (await response.json()) as {
        messages?: WidgetMessage[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to load messages");
      setMessages(payload.messages ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load messages");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  React.useEffect(() => {
    void loadMessages();
    if (!session) return;
    const timer = window.setInterval(() => void loadMessages(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadMessages, session]);

  React.useEffect(() => {
    const viewport = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isSending]);

  const send = async () => {
    const message = input.trim();
    if (!session || !message || isSending) return;

    setInput("");
    setIsSending(true);
    try {
      const response = await fetch(
        `/api/public/widget/conversations/${session.conversationId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to send message");
      await loadMessages();
      setError(null);
    } catch (sendError) {
      setInput(message);
      setError(sendError instanceof Error ? sendError.message : "Unable to send message");
    } finally {
      setIsSending(false);
    }
  };

  const lastMessage = messages[messages.length - 1];
  const status = isSending
    ? `${AGENT_NAME} is typing…`
    : lastMessage?.role === "assistant"
      ? `${AGENT_NAME} is waiting for you`
      : "Online";

  return (
    <main className="flex h-screen min-h-[460px] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <header className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 px-4 py-3.5 text-white shadow-sm">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-base font-semibold ring-1 ring-white/25 backdrop-blur">
          {AGENT_NAME.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Admissions Assistant</p>
          <p className="truncate text-xs text-blue-100">{status}</p>
        </div>
        <Sparkles className="ml-auto h-4 w-4 text-white/50" aria-hidden />
      </header>

      {!session ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500">Starting your secure chat…</p>
        </div>
      ) : (
        <>
          <ScrollArea ref={scrollRef} className="flex-1 px-3.5 py-4">
            {isLoading && messages.length === 0 ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex items-end gap-2 duration-300 animate-in fade-in slide-in-from-bottom-1",
                        isUser ? "justify-end" : "justify-start",
                      )}
                    >
                      {!isUser ? (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-[11px] font-semibold text-white shadow-sm">
                          {AGENT_NAME.charAt(0)}
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "group max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                          isUser
                            ? "rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
                            : "rounded-bl-md border border-slate-200/70 bg-white text-slate-800",
                        )}
                      >
                        {message.content}
                        <span
                          className={cn(
                            "mt-1 block text-right text-[10px] tabular-nums",
                            isUser ? "text-blue-100/80" : "text-slate-400",
                          )}
                        >
                          {formatTime(message.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {isSending ? (
                  <div className="flex items-end gap-2 duration-300 animate-in fade-in slide-in-from-bottom-1">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-[11px] font-semibold text-white shadow-sm">
                      {AGENT_NAME.charAt(0)}
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200/70 bg-white px-3.5 py-3 shadow-sm">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </ScrollArea>

          {error ? (
            <p className="border-t border-slate-200 bg-red-50 px-4 py-2 text-xs text-red-600">
              {error}
            </p>
          ) : null}

          <div className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 pl-3.5 transition-colors focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Type your message…"
                disabled={isSending}
                aria-label="Chat message"
                rows={1}
                className="max-h-28 flex-1 resize-none self-center bg-transparent py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!input.trim() || isSending}
                aria-label="Send message"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-400">
              Powered by Ai - All data stored securely and encrypted.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
