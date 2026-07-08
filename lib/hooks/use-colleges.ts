"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { College } from "@/lib/types";

const COLLEGES_KEY = ["colleges"] as const;

export function useColleges(opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: [...COLLEGES_KEY, { activeOnly: opts?.activeOnly ?? false }],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from("colleges")
        .select("*")
        .order("created_at", { ascending: false });
      if (opts?.activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as College[];
    },
  });
}

export function useCollege(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [...COLLEGES_KEY, id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("colleges")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw new Error(error.message);
      return data as College;
    },
  });
}

export type CollegeUpsertInput = {
  id?: string;
  name: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  courses?: string[];
  admission_capacity?: number | null;
  is_active?: boolean;
  logo_url?: string | null;
};

export function useUpsertCollege() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CollegeUpsertInput) => {
      const supabase = createClient();
      const payload = { ...input, country: "Singapore" };
      if (input.id) {
        const { data, error } = await supabase
          .from("colleges")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        return data as College;
      }
      const { data, error } = await supabase
        .from("colleges")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as College;
    },
    onSuccess: (college) => {
      toast.success(college ? "College saved" : "College created");
      qc.invalidateQueries({ queryKey: COLLEGES_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCollege() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("colleges").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("College deleted");
      qc.invalidateQueries({ queryKey: COLLEGES_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
