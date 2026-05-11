"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/lib/types";

const PROFILES_KEY = ["profiles"] as const;

export function useProfiles() {
  return useQuery({
    queryKey: PROFILES_KEY,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Profile[];
    },
  });
}

export function useUpdateProfileRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: PROFILES_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleProfileActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      is_active,
    }: {
      id: string;
      is_active: boolean;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .update({ is_active })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    },
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: PROFILES_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
