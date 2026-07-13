import { SuperAdminDashboard } from "@/components/dashboard/super-admin-dashboard";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSgtDateKey } from "@/lib/timezone";
import type { LeadStatus } from "@/lib/types";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const COUNSELLOR_TEAM_ROLES = ["counsellor", "admission_manager", "management"] as const;

type LeagueLead = {
  assigned_counsellor: string | null;
  created_at: string;
  status: LeadStatus;
  registration_completed_at: string | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

type CounsellorLeagueRow = {
  userId: string;
  name: string;
  leadsCreated: number;
  registrations: number;
  paidRegistrations: number;
  upcomingFollowUps: number;
  overdueFollowUps: number;
};

type PendingFollowUp = {
  assigned_user_id: string | null;
  scheduled_at: string;
  due_date: string;
};

function isRegistrationPaid(status: LeadStatus) {
  return status === "registered_paid_reg_fee" || status === "registered_closed";
}

function isRegistered(status: LeadStatus, registrationCompletedAt: string | null) {
  return (
    registrationCompletedAt !== null ||
    status === "registration_unpaid" ||
    status === "registered_paid_reg_fee" ||
    status === "registered_closed"
  );
}

function buildCounsellorLeague(
  leads: LeagueLead[],
  pendingFollowUps: PendingFollowUp[],
  userNamesById: Map<string, string>,
  now: Date,
  todayKey: string,
): CounsellorLeagueRow[] {
  const map = new Map<string, CounsellorLeagueRow>();

  for (const lead of leads) {
    const userId = lead.assigned_counsellor ?? "unassigned";
    if (userId === "unassigned") continue;

    if (!map.has(userId)) {
      map.set(userId, {
        userId,
        name:
          lead.counsellor?.full_name ||
          lead.counsellor?.email ||
          userNamesById.get(userId) ||
          "Unknown counsellor",
        leadsCreated: 0,
        registrations: 0,
        paidRegistrations: 0,
        upcomingFollowUps: 0,
        overdueFollowUps: 0,
      });
    }

    const row = map.get(userId)!;
    row.leadsCreated += 1;

    if (isRegistered(lead.status, lead.registration_completed_at)) {
      row.registrations += 1;
      if (isRegistrationPaid(lead.status)) {
        row.paidRegistrations += 1;
      }
    }
  }

  for (const followUp of pendingFollowUps) {
    const userId = followUp.assigned_user_id;
    if (!userId) continue;

    if (!map.has(userId)) {
      map.set(userId, {
        userId,
        name: userNamesById.get(userId) || "Unknown counsellor",
        leadsCreated: 0,
        registrations: 0,
        paidRegistrations: 0,
        upcomingFollowUps: 0,
        overdueFollowUps: 0,
      });
    }

    const row = map.get(userId)!;
    if (new Date(followUp.scheduled_at) < now) {
      row.overdueFollowUps += 1;
    } else if (followUp.due_date > todayKey) {
      row.upcomingFollowUps += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.paidRegistrations !== a.paidRegistrations) {
      return b.paidRegistrations - a.paidRegistrations;
    }
    if (b.registrations !== a.registrations) {
      return b.registrations - a.registrations;
    }
    return b.leadsCreated - a.leadsCreated;
  });
}

async function loadSuperAdminData() {
  const supabase = await createClient();

  const [
    { data: colleges },
    { data: profiles },
    { count: totalLeads },
    { data: followUps },
    { data: leads },
  ] = await Promise.all([
    supabase.from("colleges").select("id,is_active"),
    supabase.from("profiles").select("id,role,is_active,full_name,email").eq("is_active", true),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase
      .from("follow_ups")
      .select("id,status,scheduled_at,due_date,assigned_user_id")
      .eq("status", "pending"),
    supabase
      .from("leads")
      .select(
        "assigned_counsellor,created_at,status,registration_completed_at,counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email)",
      ),
  ]);

  const collegeRows = colleges ?? [];
  const profileRows = profiles ?? [];
  const now = new Date();
  const todayKey = getSgtDateKey(now);

  const pendingFollowUps = followUps ?? [];
  const userNamesById = new Map<string, string>(
    profileRows.map((profile) => [profile.id as string, profile.full_name || profile.email]),
  );
  const overdueFollowUps = pendingFollowUps.filter(
    (followUp) => new Date(followUp.scheduled_at) < now,
  ).length;
  const upcomingFollowUps = pendingFollowUps.filter((followUp) => {
    return followUp.due_date > todayKey && new Date(followUp.scheduled_at) >= now;
  }).length;

  const leadRows = (leads ?? []).map((row) => {
    const counsellor = Array.isArray(row.counsellor) ? row.counsellor[0] ?? null : row.counsellor;
    return {
      assigned_counsellor: row.assigned_counsellor as string | null,
      created_at: row.created_at as string,
      status: row.status as LeadStatus,
      registration_completed_at: row.registration_completed_at as string | null,
      counsellor: counsellor as { id: string; full_name: string | null; email: string } | null,
    };
  });

  const totalRegistrations = leadRows.filter(
    (lead) =>
      lead.registration_completed_at !== null ||
      lead.status === "registration_unpaid" ||
      lead.status === "registered_paid_reg_fee" ||
      lead.status === "registered_closed",
  ).length;

  return {
    collegesCount: collegeRows.length,
    activeCollegesCount: collegeRows.filter((college) => college.is_active).length,
    collegeCounsellorsCount: profileRows.filter((profile) => profile.role === "counsellor").length,
    counsellorsCount: profileRows.filter((profile) =>
      COUNSELLOR_TEAM_ROLES.includes(profile.role as (typeof COUNSELLOR_TEAM_ROLES)[number]),
    ).length,
    totalLeads: totalLeads ?? 0,
    upcomingFollowUps,
    overdueFollowUps,
    totalRegistrations,
    league: buildCounsellorLeague(
      leadRows,
      pendingFollowUps as PendingFollowUp[],
      userNamesById,
      now,
      todayKey,
    ),
  };
}

export default async function DashboardPage() {
  // Do not gate this route with requireModule("dashboard") — a denied redirect
  // back to /dashboard (or login bouncing here) caused infinite 307 loops.
  const profile = await requireProfile();

  if (profile.role !== "super_admin") {
    redirect("/dashboard/leads");
  }

  const data = await loadSuperAdminData();
  return <SuperAdminDashboard {...data} />;
}
