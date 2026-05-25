"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type {
  AdmissionGoal,
  AdmissionGoalEvent,
  AdmissionGoalEventType,
  AdmissionGoalLink,
  AdmissionGoalStatus,
  Lead,
  Profile,
} from "@/lib/types";

export const ADMISSION_GOALS_KEY = ["admission_goals"] as const;

export type AdmissionGoalWithRelations = AdmissionGoal & {
  college: { id: string; name: string; courses: string[] } | null;
  links: AdmissionGoalLink[];
  events: AdmissionGoalEvent[];
};

export type AdmissionGoalFilters = {
  status?: AdmissionGoalStatus | "all";
  collegeId?: string | "all";
  assignedUserId?: string | "all";
};

export type AdmissionGoalInput = {
  id?: string;
  title: string;
  target_count: number;
  start_date: string;
  end_date: string;
  course_name?: string | null;
  college_id?: string | null;
  intake?: string | null;
  assigned_users: string[];
  status: AdmissionGoalStatus;
};

type GoalLead = Lead & {
  college: { id: string; name: string } | null;
  counsellor: { id: string; full_name: string | null; email: string } | null;
};

export type GoalForecast = {
  elapsedDays: number;
  remainingDays: number;
  currentPace: number;
  requiredPace: number;
  expectedAchievementPercent: number;
  predictedCompletionDate: string | null;
};

export type AdmissionGoalDashboardRow = AdmissionGoalWithRelations & {
  linkedLeads: GoalLead[];
  progressPercent: number;
  remainingTarget: number;
  teamAchievementPercent: number;
  forecast: GoalForecast;
  funnel: Record<AdmissionGoalEventType, number>;
};

export type AdmissionGoalLeaderboardRow = {
  userId: string;
  name: string;
  linkedLeads: number;
  qualified: number;
  admissions: number;
  conversionRate: number;
};

export type AdmissionGoalDashboard = {
  goals: AdmissionGoalDashboardRow[];
  leaderboard: AdmissionGoalLeaderboardRow[];
  monthlyTrend: Array<{ month: string; admissions: number; qualified: number }>;
  collegePerformance: Array<{ college: string; target: number; achieved: number }>;
  coursePerformance: Array<{ course: string; target: number; achieved: number }>;
  funnelTotals: Record<AdmissionGoalEventType, number>;
};

const eventTypes: AdmissionGoalEventType[] = [
  "lead_qualified",
  "application_submitted",
  "admission_confirmed",
  "visa_approved",
];

function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function getForecast(goal: AdmissionGoal): GoalForecast {
  const now = new Date();
  const start = new Date(`${goal.start_date}T00:00:00`);
  const end = new Date(`${goal.end_date}T23:59:59`);
  const elapsedDays = Math.max(1, daysBetween(start, now));
  const remainingDays = Math.max(0, daysBetween(now, end));
  const remainingTarget = Math.max(0, goal.target_count - goal.achieved_count);
  const currentPace = goal.achieved_count / elapsedDays;
  const requiredPace = remainingDays > 0 ? remainingTarget / remainingDays : remainingTarget;
  const projectedFinal = goal.achieved_count + currentPace * remainingDays;
  const expectedAchievementPercent =
    goal.target_count > 0 ? Math.min(200, (projectedFinal / goal.target_count) * 100) : 0;
  const predictedCompletionDate =
    currentPace > 0 && remainingTarget > 0
      ? new Date(now.getTime() + (remainingTarget / currentPace) * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : remainingTarget === 0
        ? now.toISOString().slice(0, 10)
        : null;

  return {
    elapsedDays,
    remainingDays,
    currentPace: round(currentPace),
    requiredPace: round(requiredPace),
    expectedAchievementPercent: round(expectedAchievementPercent),
    predictedCompletionDate,
  };
}

function emptyFunnel(): Record<AdmissionGoalEventType, number> {
  return {
    lead_qualified: 0,
    application_submitted: 0,
    admission_confirmed: 0,
    visa_approved: 0,
  };
}

function buildDashboard({
  goals,
  leads,
  profiles,
}: {
  goals: AdmissionGoalWithRelations[];
  leads: GoalLead[];
  profiles: Profile[];
}): AdmissionGoalDashboard {
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const linkedLeadIdsByGoal = new Map<string, Set<string>>();
  const eventsByGoal = new Map<string, AdmissionGoalEvent[]>();

  goals.forEach((goal) => {
    linkedLeadIdsByGoal.set(goal.id, new Set(goal.links.map((link) => link.lead_id)));
    eventsByGoal.set(goal.id, goal.events);
  });

  const dashboardGoals = goals.map((goal) => {
    const linkedLeads = Array.from(linkedLeadIdsByGoal.get(goal.id) ?? [])
      .map((leadId) => leadsById.get(leadId))
      .filter(Boolean) as GoalLead[];
    const funnel = emptyFunnel();
    (eventsByGoal.get(goal.id) ?? []).forEach((event) => {
      funnel[event.event_type] += 1;
    });
    const progressPercent =
      goal.target_count > 0 ? Math.min(100, (goal.achieved_count / goal.target_count) * 100) : 0;
    const remainingTarget = Math.max(0, goal.target_count - goal.achieved_count);
    const teamSize = Math.max(1, goal.assigned_users.length || 1);
    const teamAchievementPercent =
      goal.target_count > 0 ? (goal.achieved_count / goal.target_count) * 100 : 0;

    return {
      ...goal,
      linkedLeads,
      progressPercent: round(progressPercent),
      remainingTarget,
      teamAchievementPercent: round(teamAchievementPercent / teamSize),
      forecast: getForecast(goal),
      funnel,
    };
  });

  const leaderboardByUser = new Map<string, AdmissionGoalLeaderboardRow>();
  goals.forEach((goal) => {
    const goalLeadIds = linkedLeadIdsByGoal.get(goal.id) ?? new Set<string>();
    goalLeadIds.forEach((leadId) => {
      const lead = leadsById.get(leadId);
      const userId = lead?.assigned_counsellor;
      if (!lead || !userId) return;
      const profile = profilesById.get(userId);
      const row =
        leaderboardByUser.get(userId) ??
        {
          userId,
          name: profile?.full_name || profile?.email || "Unknown user",
          linkedLeads: 0,
          qualified: 0,
          admissions: 0,
          conversionRate: 0,
        };
      row.linkedLeads += 1;
      const userEvents = goal.events.filter((event) => event.lead_id === leadId);
      if (userEvents.some((event) => event.event_type === "lead_qualified")) row.qualified += 1;
      if (userEvents.some((event) => event.event_type === "admission_confirmed")) {
        row.admissions += 1;
      }
      leaderboardByUser.set(userId, row);
    });
  });

  const leaderboard = Array.from(leaderboardByUser.values())
    .map((row) => ({
      ...row,
      conversionRate: row.qualified > 0 ? round((row.admissions / row.qualified) * 100) : 0,
    }))
    .sort((a, b) => b.admissions - a.admissions || b.conversionRate - a.conversionRate);

  const monthly = new Map<string, { month: string; admissions: number; qualified: number }>();
  const college = new Map<string, { college: string; target: number; achieved: number }>();
  const course = new Map<string, { course: string; target: number; achieved: number }>();
  const funnelTotals = emptyFunnel();

  goals.forEach((goal) => {
    const month = goal.start_date.slice(0, 7);
    const monthRow = monthly.get(month) ?? { month, admissions: 0, qualified: 0 };
    monthRow.admissions += goal.events.filter((event) => event.event_type === "admission_confirmed").length;
    monthRow.qualified += goal.events.filter((event) => event.event_type === "lead_qualified").length;
    monthly.set(month, monthRow);

    const collegeLabel = goal.college?.name ?? "All colleges";
    const collegeRow = college.get(collegeLabel) ?? { college: collegeLabel, target: 0, achieved: 0 };
    collegeRow.target += goal.target_count;
    collegeRow.achieved += goal.achieved_count;
    college.set(collegeLabel, collegeRow);

    const courseLabel = goal.course_name ?? "All courses";
    const courseRow = course.get(courseLabel) ?? { course: courseLabel, target: 0, achieved: 0 };
    courseRow.target += goal.target_count;
    courseRow.achieved += goal.achieved_count;
    course.set(courseLabel, courseRow);

    eventTypes.forEach((eventType) => {
      funnelTotals[eventType] += goal.events.filter((event) => event.event_type === eventType).length;
    });
  });

  return {
    goals: dashboardGoals,
    leaderboard,
    monthlyTrend: Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month)),
    collegePerformance: Array.from(college.values()).sort((a, b) => b.achieved - a.achieved),
    coursePerformance: Array.from(course.values()).sort((a, b) => b.achieved - a.achieved),
    funnelTotals,
  };
}

export function useAdmissionGoals(filters: AdmissionGoalFilters = {}) {
  return useQuery({
    queryKey: [...ADMISSION_GOALS_KEY, filters],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from("admission_goals")
        .select(
          "*, college:colleges(id,name,courses), links:admission_goal_links(*), events:admission_goal_events(*)",
        )
        .order("start_date", { ascending: false });

      if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters.collegeId && filters.collegeId !== "all") {
        q = q.eq("college_id", filters.collegeId);
      }
      if (filters.assignedUserId && filters.assignedUserId !== "all") {
        q = q.contains("assigned_users", [filters.assignedUserId]);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as AdmissionGoalWithRelations[];
    },
  });
}

export function useAdmissionGoalDashboard(filters: AdmissionGoalFilters = {}) {
  return useQuery({
    queryKey: [...ADMISSION_GOALS_KEY, "dashboard", filters],
    queryFn: async () => {
      const supabase = createClient();
      let goalsQuery = supabase
        .from("admission_goals")
        .select(
          "*, college:colleges(id,name,courses), links:admission_goal_links(*), events:admission_goal_events(*)",
        )
        .order("start_date", { ascending: false });

      if (filters.status && filters.status !== "all") goalsQuery = goalsQuery.eq("status", filters.status);
      if (filters.collegeId && filters.collegeId !== "all") {
        goalsQuery = goalsQuery.eq("college_id", filters.collegeId);
      }
      if (filters.assignedUserId && filters.assignedUserId !== "all") {
        goalsQuery = goalsQuery.contains("assigned_users", [filters.assignedUserId]);
      }

      const [{ data: goals, error: goalsError }, { data: leads, error: leadsError }, { data: profiles, error: profilesError }] =
        await Promise.all([
          goalsQuery,
          supabase
            .from("leads")
            .select(
              "*, college:colleges(id,name), counsellor:profiles!leads_assigned_counsellor_fkey(id,full_name,email)",
            ),
          supabase.from("profiles").select("*"),
        ]);

      if (goalsError) throw new Error(goalsError.message);
      if (leadsError) throw new Error(leadsError.message);
      if (profilesError) throw new Error(profilesError.message);

      return buildDashboard({
        goals: (goals ?? []) as AdmissionGoalWithRelations[],
        leads: (leads ?? []) as GoalLead[],
        profiles: (profiles ?? []) as Profile[],
      });
    },
  });
}

export function useUpsertAdmissionGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdmissionGoalInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload = {
        title: input.title,
        target_count: input.target_count,
        start_date: input.start_date,
        end_date: input.end_date,
        course_name: input.course_name || null,
        college_id: input.college_id || null,
        intake: input.intake || null,
        assigned_users: input.assigned_users,
        status: input.status,
        created_by: user?.id ?? null,
      };

      if (input.id) {
        const { data, error } = await supabase
          .from("admission_goals")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        return data as AdmissionGoal;
      }

      const { data, error } = await supabase
        .from("admission_goals")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as AdmissionGoal;
    },
    onSuccess: () => {
      toast.success("Admission goal saved");
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteAdmissionGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("admission_goals").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Admission goal deleted");
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useLinkLeadToAdmissionGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goalId, leadId }: { goalId: string; leadId: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("admission_goal_links").insert({
        goal_id: goalId,
        lead_id: leadId,
        matched_by: "manual",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lead linked to goal");
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRecordAdmissionGoalEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      goalId,
      leadId,
      eventType,
    }: {
      goalId: string;
      leadId: string;
      eventType: AdmissionGoalEventType;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("record_admission_goal_event", {
        p_goal_id: goalId,
        p_lead_id: leadId,
        p_event_type: eventType,
        p_metadata: { source: "manual" },
      });
      if (error) throw new Error(error.message);
      return data as AdmissionGoalEvent;
    },
    onSuccess: () => {
      toast.success("Goal milestone recorded");
      qc.invalidateQueries({ queryKey: ADMISSION_GOALS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
