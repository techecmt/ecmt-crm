"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export const CURRENT_PROFILE_KEY = ["current-profile"] as const;

/**
 * The profile of the currently logged-in user, for client components that need
 * to default things (assignee, filters) to "me". Cached so it resolves once
 * per session rather than on every dialog open.
 */
export function useCurrentProfile() {
  return useQuery({
    queryKey: CURRENT_PROFILE_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    },
  });
}
