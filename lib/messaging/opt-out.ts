import "server-only";

import { canonicalizePhoneKey } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Exact-match keywords only, mirroring Twilio's own opt-out handling. Matching
 * loosely would let "cancel my appointment" unsubscribe a live lead.
 */
export const OPT_OUT_KEYWORDS = [
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "optout",
  "opt out",
  "opt-out",
];

export const OPT_IN_KEYWORDS = ["start", "unstop", "subscribe", "resume"];

export function detectOptOutIntent(text: string): "opt_out" | "opt_in" | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ");
  if (!normalized) return null;
  if (OPT_OUT_KEYWORDS.includes(normalized)) return "opt_out";
  if (OPT_IN_KEYWORDS.includes(normalized)) return "opt_in";
  return null;
}

/** Records the opt-out and flags the matching lead so no channel messages them. */
export async function recordOptOut(
  supabase: AdminClient,
  input: { phone: string; leadId?: string | null; source?: "stop_keyword" | "manual" | "import"; note?: string },
) {
  const phoneKey = canonicalizePhoneKey(input.phone);
  if (!phoneKey) return null;

  const { error } = await supabase.from("messaging_opt_outs").upsert(
    {
      phone_key: phoneKey,
      phone: input.phone,
      source: input.source ?? "stop_keyword",
      lead_id: input.leadId ?? null,
      note: input.note ?? null,
    },
    { onConflict: "phone_key" },
  );
  if (error) {
    console.error("[OptOut] Failed to record opt-out:", error.message);
    return null;
  }

  await supabase
    .from("leads")
    .update({
      do_not_contact: true,
      do_not_contact_at: new Date().toISOString(),
      do_not_contact_reason: input.source === "manual" ? "Marked by staff" : "Replied STOP on WhatsApp",
    })
    .eq("phone_key", phoneKey);

  return phoneKey;
}

export async function clearOptOut(supabase: AdminClient, phone: string) {
  const phoneKey = canonicalizePhoneKey(phone);
  if (!phoneKey) return null;

  await supabase.from("messaging_opt_outs").delete().eq("phone_key", phoneKey);
  await supabase
    .from("leads")
    .update({ do_not_contact: false, do_not_contact_at: null, do_not_contact_reason: null })
    .eq("phone_key", phoneKey);

  return phoneKey;
}

export async function isOptedOut(supabase: AdminClient, phone: string) {
  const phoneKey = canonicalizePhoneKey(phone);
  if (!phoneKey) return false;
  const { data } = await supabase
    .from("messaging_opt_outs")
    .select("phone_key")
    .eq("phone_key", phoneKey)
    .maybeSingle();
  return Boolean(data);
}
