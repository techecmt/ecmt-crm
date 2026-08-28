import "server-only";

import { isWithinAiHours, normalizeAiHoursSchedule } from "@/lib/ai-hours";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AiAvailability = {
  available: boolean;
  reason: "active" | "disabled" | "outside_hours" | "no_agent";
  /** Sent once when the bot goes quiet outside its hours; blank means stay silent. */
  offlineMessage: string | null;
};

const AVAILABLE: AiAvailability = { available: true, reason: "active", offlineMessage: null };

/**
 * Whether the AI should answer right now: the agent's master switch plus its
 * weekly schedule. Outside those windows the conversation belongs to a human.
 */
export async function getAgentAvailability(
  supabase: AdminClient,
  agentId: string | null,
  at: Date = new Date(),
): Promise<AiAvailability> {
  let query = supabase
    .from("ai_agents")
    .select("id, is_active, business_hours_enabled, business_hours, offline_message");
  query = agentId ? query.eq("id", agentId) : query.eq("is_default", true);

  const { data: agent } = await query.maybeSingle();
  if (!agent) return { available: true, reason: "no_agent", offlineMessage: null };

  if (!agent.is_active) {
    return { available: false, reason: "disabled", offlineMessage: null };
  }

  if (!agent.business_hours_enabled) return AVAILABLE;

  const schedule = normalizeAiHoursSchedule(agent.business_hours);
  if (isWithinAiHours(schedule, at)) return AVAILABLE;

  const offlineMessage =
    typeof agent.offline_message === "string" && agent.offline_message.trim()
      ? agent.offline_message.trim()
      : null;
  return { available: false, reason: "outside_hours", offlineMessage };
}
