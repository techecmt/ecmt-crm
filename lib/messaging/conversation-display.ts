import type { Conversation } from "@/lib/hooks/use-conversations";

export function websitePageLabel(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const slug = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop();
    if (!slug) return "Home";
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return null;
  }
}

export function conversationTitle(conversation: Conversation) {
  const visitorName = conversation.visitor_data?.name?.trim();
  if (conversation.name?.trim()) return conversation.name.trim();
  if (visitorName) return visitorName;
  if (conversation.phone) return conversation.phone;
  if (conversation.channel === "website") {
    const page = websitePageLabel(conversation.source_url);
    return page ? `Visitor · ${page}` : "Website visitor";
  }
  return conversation.external_user_id;
}

export function conversationSubtitle(conversation: Conversation) {
  if (conversation.channel === "website") {
    return (
      conversation.visitor_data?.email ||
      conversation.visitor_data?.phone ||
      websitePageLabel(conversation.source_url) ||
      "Website chat"
    );
  }
  return conversation.phone || conversation.external_user_id;
}

export function lastMessagePrefix(role: string | null | undefined) {
  if (role === "user") return "Visitor";
  if (role === "assistant") return "LISA";
  return "";
}

export function isWaitingForReply(conversation: Conversation) {
  return (
    conversation.last_message_role === "user" &&
    conversation.status !== "resolved" &&
    conversation.status !== "spam"
  );
}

export function channelShortLabel(channel: Conversation["channel"]) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "messenger") return "Messenger";
  return "Website";
}
