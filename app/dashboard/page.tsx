import { createClient } from "@/lib/supabase/server";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { requireProfile } from "@/lib/auth";
import type { FollowUpPriority, FollowUpType, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadData() {
  const supabase = await createClient();
  const profile = await requireProfile();
  const leadsQuery = supabase.from("leads").select("*");
  const followUpsQuery = supabase
    .from("follow_ups")
    .select(
      "*,lead:leads(id,full_name,phone,status,lead_score,assigned_counsellor,created_at,follow_up_date)",
    )
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true });

  if (profile.role === "counsellor") {
    leadsQuery.eq("assigned_counsellor", profile.id);
    followUpsQuery.eq("assigned_user_id", profile.id);
  }

  const [{ data: leads }, { data: colleges }, { count: usersCount }, { data: followUps }] =
    await Promise.all([
      leadsQuery,
      supabase.from("colleges").select("id,name,is_active"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      followUpsQuery,
    ]);

  return {
    leads: (leads ?? []) as Lead[],
    colleges: (colleges ?? []) as Array<{ id: string; name: string; is_active: boolean }>,
    usersCount: usersCount ?? 0,
    profile,
    followUps: (followUps ?? []).map((row) => {
      const r = row as unknown as {
        id: string;
        scheduled_at: string;
        due_date: string;
        due_time: string;
        status: string;
        type: FollowUpType;
        followup_type: FollowUpType;
        priority: FollowUpPriority;
        completed_at: string | null;
        remarks: string | null;
        lead:
          | {
              id: string;
              full_name: string;
              phone: string;
              status: string;
              lead_score: number;
              assigned_counsellor: string | null;
              created_at: string;
              follow_up_date: string | null;
            }
          | {
              id: string;
              full_name: string;
              phone: string;
              status: string;
              lead_score: number;
              assigned_counsellor: string | null;
              created_at: string;
              follow_up_date: string | null;
            }[]
          | null;
      };
      const lead = Array.isArray(r.lead) ? r.lead[0] ?? null : r.lead;
      return { ...r, lead };
    }),
  };
}

export default async function DashboardPage() {
  const data = await loadData();
  return <DashboardOverview {...data} />;
}
