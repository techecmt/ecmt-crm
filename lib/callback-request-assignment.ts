import type { SupabaseClient } from "@supabase/supabase-js";

export const OPEN_CALLBACK_REQUEST_STATUSES = ["new", "contacted", "confirmed"] as const;

export async function syncOpenCallbackRequestsCounsellor(
  supabase: SupabaseClient,
  leadIds: string | string[],
  assignedCounsellor: string | null,
) {
  const ids = (Array.isArray(leadIds) ? leadIds : [leadIds]).filter(Boolean);
  if (!ids.length) return;

  const { error } = await supabase
    .from("callback_requests")
    .update({ assigned_counsellor: assignedCounsellor })
    .in("lead_id", ids)
    .in("status", [...OPEN_CALLBACK_REQUEST_STATUSES]);
  if (error) throw new Error(error.message);
}
