"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  }, [messages]);

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

  return (
    <main className="flex h-screen min-h-[460px] flex-col overflow-hidden bg-background text-foreground">
      <header className="border-b bg-blue-600 px-4 py-3 text-primary-foreground">
        <p className="font-semibold">Admissions Assistant</p>
        <p className="text-xs text-blue-100">Ask about courses and admissions</p>
      </header>

      {!session ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <p className="text-sm text-muted-foreground">Starting your secure chat…</p>
        </div>
      ) : (
        <>
          <ScrollArea ref={scrollRef} className="flex-1 p-4">
            {isLoading && messages.length === 0 ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        message.role === "user"
                          ? "rounded-br-sm bg-blue-600 text-white"
                          : "rounded-bl-sm bg-muted text-foreground"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {error ? (
            <p className="border-t px-3 py-2 text-xs text-destructive">{error}</p>
          ) : null}

          <div className="border-t p-3">
            <div className="flex gap-2">
              <Input
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
              />
              <Button
                size="icon"
                onClick={() => void send()}
                disabled={!input.trim() || isSending}
                aria-label="Send message"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
