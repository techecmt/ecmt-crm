"use client";

import * as React from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useColleges } from "@/lib/hooks/use-colleges";
import {
  useDeleteEventPhoto,
  useUploadEventPhoto,
  useUpsertEventPost,
} from "@/lib/hooks/use-events";
import type { EventPost } from "@/lib/types";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.enum(["event", "news"]),
  event_date: z.string().optional(),
  location: z.string().optional(),
  college_id: z.string().optional(),
  status: z.enum(["draft", "published"]),
});

type FormValues = z.infer<typeof schema>;

interface EventPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post?: EventPost | null;
}

export function EventPostDialog({ open, onOpenChange, post }: EventPostDialogProps) {
  const isEditing = !!post;
  const { data: colleges = [] } = useColleges({ activeOnly: true });

  const upsert = useUpsertEventPost();
  const uploadPhoto = useUploadEventPhoto();
  const deletePhoto = useDeleteEventPhoto();

  // Track photos for newly created/edited post
  const [savedPostId, setSavedPostId] = React.useState<string | null>(post?.id ?? null);
  const [existingPhotos, setExistingPhotos] = React.useState(post?.photos ?? []);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [uploadingCount, setUploadingCount] = React.useState(0);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: post?.title ?? "",
      description: post?.description ?? "",
      type: post?.type ?? "event",
      event_date: post?.event_date ?? "",
      location: post?.location ?? "",
      college_id: post?.college_id ?? "",
      status: post?.status ?? "draft",
    },
  });

  // Reset when dialog opens/closes or post changes
  React.useEffect(() => {
    if (open) {
      form.reset({
        title: post?.title ?? "",
        description: post?.description ?? "",
        type: post?.type ?? "event",
        event_date: post?.event_date ?? "",
        location: post?.location ?? "",
        college_id: post?.college_id ?? "",
        status: post?.status ?? "draft",
      });
      setSavedPostId(post?.id ?? null);
      setExistingPhotos(post?.photos ?? []);
      setPendingFiles([]);
    }
  }, [open, post, form]);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const validFiles = files.filter((f) => f.type.startsWith("image/"));
    if (validFiles.length !== files.length) {
      toast.warning("Only image files are accepted");
    }
    setPendingFiles((prev) => [...prev, ...validFiles]);
    // Reset so same file can be re-picked
    e.target.value = "";
  }

  function removePending(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleRemoveExisting(photoId: string, storagePath: string) {
    await deletePhoto.mutateAsync({ photoId, storagePath });
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }

  async function onSubmit(values: FormValues) {
    const postData = {
      id: savedPostId ?? undefined,
      title: values.title,
      description: values.description || null,
      type: values.type,
      event_date: values.event_date || null,
      location: values.location || null,
      college_id: (values.college_id && values.college_id !== "__none__") ? values.college_id : null,
      status: values.status,
    };

    let currentPostId = savedPostId;

    try {
      const saved = await upsert.mutateAsync(postData);
      currentPostId = saved.id;
      setSavedPostId(saved.id);
    } catch {
      return;
    }

    // Upload pending photos
    if (pendingFiles.length > 0) {
      setUploadingCount(pendingFiles.length);
      const baseOrder = existingPhotos.length;
      const uploads = pendingFiles.map((file, i) =>
        uploadPhoto
          .mutateAsync({ postId: currentPostId!, file, displayOrder: baseOrder + i })
          .catch((err: Error) => {
            toast.error(`Failed to upload ${file.name}: ${err.message}`);
            return null;
          }),
      );
      await Promise.all(uploads);
      setUploadingCount(0);
      setPendingFiles([]);
    }

    onOpenChange(false);
  }

  const isBusy = upsert.isPending || uploadingCount > 0 || deletePhoto.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Post" : "New Event / News Post"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Type + Status row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="news">News</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Student Orientation – May 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the event or news..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date + Location row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="event_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Campus, Singapore" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* College */}
            <FormField
              control={form.control}
              name="college_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>College (optional)</FormLabel>
                  <Select
                    value={field.value || "__none__"}
                    onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a college" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {colleges.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Photos section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base">Photos</FormLabel>
                <span className="text-xs text-muted-foreground">
                  {existingPhotos.length + pendingFiles.length} attached
                </span>
              </div>

              {/* Existing photos */}
              {existingPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {existingPhotos.map((photo) => (
                    <div key={photo.id} className="group relative h-20 w-20">
                      <Image
                        src={photo.url}
                        alt={photo.caption ?? "photo"}
                        fill
                        sizes="80px"
                        className="rounded-md object-cover"
                      />
                      <button
                        type="button"
                        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-white group-hover:flex"
                        onClick={() => handleRemoveExisting(photo.id, photo.storage_path)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending files (not yet uploaded) */}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingFiles.map((file, i) => (
                    <div key={i} className="group relative h-20 w-20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="h-full w-full rounded-md object-cover opacity-70"
                      />
                      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/20 text-[10px] text-white">
                        Pending
                      </div>
                      <button
                        type="button"
                        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-white group-hover:flex"
                        onClick={() => removePending(i)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <UploadCloud className="h-4 w-4" />
                Click to add photos
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilePick}
              />
              {uploadingCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Uploading {uploadingCount} photo{uploadingCount !== 1 ? "s" : ""}…
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : isEditing ? (
                  "Save changes"
                ) : (
                  "Create post"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Inline delete confirmation dialog
interface DeleteEventPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  title: string;
}

export function DeleteEventPostDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  title,
}: DeleteEventPostDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete post?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <strong>{title}</strong> and all its photos will be permanently deleted.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
