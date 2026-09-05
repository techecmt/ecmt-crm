"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { ClassroomRental, ClassroomRentalStatus, ClassroomType } from "@/lib/types";

export const CLASSROOM_RENTALS_KEY = ["classroom_rentals"] as const;

export type ClassroomRentalWithRelations = ClassroomRental & {
  creator: { id: string; full_name: string | null; email: string } | null;
};

export type ClassroomRentalFilters = {
  classroom?: ClassroomType | "all";
  status?: ClassroomRentalStatus | "all";
};

const CLASSROOM_RENTAL_SELECT =
  "*, creator:profiles!classroom_rentals_created_by_fkey(id,full_name,email)";

export function useClassroomRentals(filters: ClassroomRentalFilters = {}) {
  return useQuery({
    queryKey: [...CLASSROOM_RENTALS_KEY, filters],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("classroom_rentals")
        .select(CLASSROOM_RENTAL_SELECT)
        .order("booking_date", { ascending: true })
        .order("classroom", { ascending: true })
        .order("end_time", { ascending: true });

      if (filters.classroom && filters.classroom !== "all") {
        query = query.eq("classroom", filters.classroom);
      }
      if (filters.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as ClassroomRentalWithRelations[];
    },
  });
}

export type ClassroomRentalPatch = {
  status?: ClassroomRentalStatus;
  internalNotes?: string | null;
};

export function useUpdateClassroomRental() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      rentalId,
      patch,
    }: {
      rentalId: string;
      patch: ClassroomRentalPatch;
    }) => {
      const updates: Record<string, string | null> = {};
      if (patch.status !== undefined) {
        updates.status = patch.status;
      }
      if (patch.internalNotes !== undefined) {
        updates.internal_notes = patch.internalNotes?.trim() || null;
      }
      if (!Object.keys(updates).length) return;

      const { error } = await createClient()
        .from("classroom_rentals")
        .update(updates)
        .eq("id", rentalId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Booking updated");
      queryClient.invalidateQueries({ queryKey: CLASSROOM_RENTALS_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
