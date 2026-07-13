import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getUserModules,
  type AppModule,
  type Profile,
  type UserRole,
} from "@/lib/types";

/** Preferred landing paths when a module is denied or after login. */
const MODULE_HOME_PATHS: Partial<Record<AppModule, string>> = {
  dashboard: "/dashboard",
  leads: "/dashboard/leads",
  follow_ups: "/dashboard/follow-ups",
  message_centre: "/dashboard/message-centre",
  admission_goals: "/dashboard/admission-goals",
  colleges: "/dashboard/colleges",
  events: "/dashboard/events",
  marketing: "/dashboard/marketing",
  forms: "/dashboard/forms",
  users: "/dashboard/users",
  settings: "/dashboard/settings",
  whatsapp: "/dashboard/whatsapp",
};

/** Safe default home — works for every role (Dashboard nav is super-admin only). */
export const DEFAULT_APP_HOME = "/dashboard/leads";

export function getPostLoginPath(role: UserRole | null | undefined): string {
  return role === "super_admin" ? "/dashboard" : DEFAULT_APP_HOME;
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function resolveAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) return user.id;

  // During cookie refresh, getUser() can briefly fail while JWT claims are still valid.
  // Falling back prevents /dashboard ↔ /auth/login redirect loops.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const userId = await resolveAuthUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data?.is_active) return null;
  return data as Profile;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  return profile;
}

export function hasModuleAccess(profile: Profile, module: AppModule) {
  return getUserModules(profile).includes(module);
}

/** First allowed app path for this user (never loops back to a denied module). */
export function getHomePathForProfile(
  profile: Profile,
  options?: { excludeModule?: AppModule },
): string {
  const modules = getUserModules(profile).filter(
    (module) => module !== options?.excludeModule,
  );

  for (const module of modules) {
    const path = MODULE_HOME_PATHS[module];
    // Prefer operational pages over /dashboard to avoid landing loops.
    if (path && path !== "/dashboard") return path;
  }

  if (modules.includes("leads")) return DEFAULT_APP_HOME;
  if (modules.includes("dashboard")) return getPostLoginPath(profile.role);

  return DEFAULT_APP_HOME;
}

export async function requireModule(module: AppModule): Promise<Profile> {
  const profile = await requireProfile();
  if (!hasModuleAccess(profile, module)) {
    const target = getHomePathForProfile(profile, { excludeModule: module });
    // A user with no accessible module would otherwise be redirected back to the
    // page that just denied them (getHomePathForProfile falls back to
    // DEFAULT_APP_HOME), causing an infinite 307 redirect loop. Sign them out
    // instead so they land on the login page rather than looping forever.
    if (getUserModules(profile).length === 0 || target === MODULE_HOME_PATHS[module]) {
      redirect("/auth/login");
    }
    redirect(target);
  }
  return profile;
}
