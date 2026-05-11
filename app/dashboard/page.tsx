import { createClient } from "@/lib/supabase/server";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadData() {
  const supabase = await createClient();
  const [{ data: leads }, { data: colleges }, { count: usersCount }, { data: upcoming }] =
    await Promise.all([
      supabase.from("leads").select("*"),
      supabase.from("colleges").select("id,name,is_active"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("follow_ups")
        .select(
          "id,scheduled_at,status,type,lead:leads(id,full_name,phone)",
        )
        .eq("status", "pending")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(8),
    ]);

  return {
    leads: (leads ?? []) as Lead[],
    colleges: (colleges ?? []) as Array<{ id: string; name: string; is_active: boolean }>,
    usersCount: usersCount ?? 0,
    upcoming: (upcoming ?? []).map((row) => {
      const r = row as unknown as {
        id: string;
        scheduled_at: string;
        status: string;
        type: string;
        lead:
          | { id: string; full_name: string; phone: string }
          | { id: string; full_name: string; phone: string }[]
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
