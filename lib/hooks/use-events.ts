"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { EventPost, EventPostPhoto, EventPostStatus, EventPostType } from "@/lib/types";

const EVENTS_KEY = ["event_posts"] as const;

export function useEventPosts(opts?: { status?: EventPostStatus; collegeId?: string }) {
  return useQuery({
    queryKey: [...EVENTS_KEY, { status: opts?.status, collegeId: opts?.collegeId }],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from("event_posts")
        .select(
          `*, photos:event_post_photos(id, post_id, storage_path, url, display_order, caption, created_at), college:colleges(id, name, city, country)`,
        )
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (opts?.status) q = q.eq("status", opts.status);
      if (opts?.collegeId) q = q.eq("college_id", opts.collegeId);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as EventPost[];
    },
  });
}

export function useEventPost(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [...EVENTS_KEY, id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_posts")
        .select(
          `*, photos:event_post_photos(id, post_id, storage_path, url, display_order, caption, created_at), college:colleges(id, name, city, country)`,
        )
        .eq("id", id!)
        .single();
      if (error) throw new Error(error.message);
      return data as EventPost;
    },
  });
}

export type EventPostInput = {
  id?: string;
  title: string;
  description?: string | null;
  type: EventPostType;
  event_date?: string | null;
  location?: string | null;
  college_id?: string | null;
  status: EventPostStatus;
};

export function useUpsertEventPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EventPostInput) => {
      const supabase = createClient();
      const { id, ...payload } = input;
      if (id) {
        const { data, error } = await supabase
          .from("event_posts")
          .update(payload)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        return data as EventPost;
      }
      const { data, error } = await supabase
        .from("event_posts")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as EventPost;
    },
    onSuccess: (post) => {
      toast.success(post ? "Post saved" : "Post created");
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteEventPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // Delete associated storage objects first
      const { data: photos } = await supabase
        .from("event_post_photos")
        .select("storage_path")
        .eq("post_id", id);
      if (photos?.length) {
        await supabase.storage
          .from("event-photos")
          .remove(photos.map((p) => p.storage_path));
      }
      const { error } = await supabase.from("event_posts").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Post deleted");
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUploadEventPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      file,
      displayOrder,
      caption,
    }: {
      postId: string;
      file: File;
      displayOrder: number;
      caption?: string;
    }) => {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${postId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-photos")
        .upload(path, file, { upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage
        .from("event-photos")
        .getPublicUrl(path);

      const { data, error } = await supabase
        .from("event_post_photos")
        .insert({
          post_id: postId,
          storage_path: path,
          url: urlData.publicUrl,
          display_order: displayOrder,
          caption: caption ?? null,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as EventPostPhoto;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
    onError: (err: Error) => toast.error(`Upload failed: ${err.message}`),
  });
}

export function useDeleteEventPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photoId, storagePath }: { photoId: string; storagePath: string }) => {
      const supabase = createClient();
      await supabase.storage.from("event-photos").remove([storagePath]);
      const { error } = await supabase
        .from("event_post_photos")
        .delete()
        .eq("id", photoId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
    onError: (err: Error) => toast.error(err.message),
  });
}
