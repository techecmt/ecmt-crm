"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface Form {
  id: string;
  form_key: string;
  title: string;
  description: string | null;
  version: number;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FormField {
  id: number;
  form_id: string;
  field_key: string;
  label: string;
  field_type: string;
  field_order: number;
  is_required: boolean;
  is_active: boolean;
  options: Record<string, unknown>;
  created_at: string;
}

export interface FormSubmission {
  id: number;
  submission_uid: string;
  form_id: string;
  submitted_at: string;
  submitter_name: string | null;
  submitter_email: string | null;
  source_path: string | null;
  source_url: string | null;
  values_json: Record<string, string | number | boolean | null>;
}

export function useForms() {
  return useQuery({
    queryKey: ["forms"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("forms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Form[];
    },
  });
}

export function useFormFields(formId: string | null) {
  return useQuery({
    enabled: !!formId,
    queryKey: ["form_fields", formId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", formId!)
        .order("field_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as FormField[];
    },
  });
}

export function useFormSubmissions(formId: string | null) {
  return useQuery({
    enabled: !!formId,
    queryKey: ["form_submissions", formId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("form_id", formId!)
        .order("submitted_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FormSubmission[];
    },
  });
}
