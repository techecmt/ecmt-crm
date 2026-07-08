"use client";

import * as React from "react";
import { CalendarDays, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useColleges } from "@/lib/hooks/use-colleges";
import { useDeleteEventPost, useEventPosts } from "@/lib/hooks/use-events";
import type { EventPost, EventPostType } from "@/lib/types";
import { EventPostCard } from "./event-post-card";
import { DeleteEventPostDialog, EventPostDialog } from "./event-post-dialog";

interface EventsPageClientProps {
  canManage: boolean;
}

export function EventsPageClient({ canManage }: EventsPageClientProps) {
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<EventPostType | "all">("all");
  const [collegeFilter, setCollegeFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "published" | "draft">(
    canManage ? "all" : "published",
  );

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editPost, setEditPost] = React.useState<EventPost | null>(null);
  const [deletePost, setDeletePost] = React.useState<EventPost | null>(null);

  const { data: posts = [], isLoading } = useEventPosts();
  const { data: colleges = [] } = useColleges({ activeOnly: true });
  const deleteMutation = useDeleteEventPost();

  const filtered = React.useMemo(() => {
    return posts.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (collegeFilter !== "all" && p.college_id !== collegeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [posts, statusFilter, typeFilter, collegeFilter, search]);

  async function handleConfirmDelete() {
    if (!deletePost) return;
    await deleteMutation.mutateAsync(deletePost.id);
    setDeletePost(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events &amp; News</h1>
          <p className="text-sm text-muted-foreground">
            Campus events and news updates with photo galleries
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Post
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search posts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as EventPostType | "all")}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="event">Events</SelectItem>
            <SelectItem value="news">News</SelectItem>
          </SelectContent>
        </Select>

        {colleges.length > 0 && (
          <Select value={collegeFilter} onValueChange={setCollegeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="College" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All colleges</SelectItem>
              {colleges.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {canManage && (
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No posts found</p>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create your first post
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {filtered.map((post) => (
            <EventPostCard
              key={post.id}
              post={post}
              canManage={canManage}
              onEdit={setEditPost}
              onDelete={setDeletePost}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <EventPostDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        post={null}
      />

      {/* Edit dialog */}
      {editPost && (
        <EventPostDialog
          open={!!editPost}
          onOpenChange={(o) => { if (!o) setEditPost(null); }}
          post={editPost}
        />
      )}

      {/* Delete confirmation */}
      <DeleteEventPostDialog
        open={!!deletePost}
        onOpenChange={(o) => { if (!o) setDeletePost(null); }}
        onConfirm={handleConfirmDelete}
        isPending={deleteMutation.isPending}
        title={deletePost?.title ?? ""}
      />
    </div>
  );
}
