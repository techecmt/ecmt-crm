import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUserModules, type AppModule, type Profile } from "@/lib/types";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) return null;
  if (!data?.is_active) return null;
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

export async function requireModule(module: AppModule): Promise<Profile> {
  const profile = await requireProfile();
  if (!hasModuleAccess(profile, module)) {
    redirect("/dashboard");
  }
  return profile;
}
