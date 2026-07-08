"use client";

import * as React from "react";
import Image from "next/image";
import { CalendarDays, MapPin, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSgtDate } from "@/lib/timezone";
import type { EventPost } from "@/lib/types";

const GRID_VISIBLE = 7;

interface EventPostCardProps {
  post: EventPost;
  canManage: boolean;
  onEdit: (post: EventPost) => void;
  onDelete: (post: EventPost) => void;
}

export function EventPostCard({ post, canManage, onEdit, onDelete }: EventPostCardProps) {
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState(0);

  const photos = post.photos ?? [];
  const visiblePhotos = photos.slice(0, GRID_VISIBLE);
  const overflowCount = photos.length > GRID_VISIBLE ? photos.length - GRID_VISIBLE : 0;

  const collegeLabel = post.college
    ? [post.college.name, post.college.city, post.college.country]
        .filter(Boolean)
        .join(", ")
    : post.location;

  function openLightbox(index: number) {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }

  return (
    <>
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
        {/* Header meta row */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {post.event_date && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
                {formatSgtDate(post.event_date)}
              </span>
            )}
            {(collegeLabel || post.location) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {post.college ? collegeLabel : post.location}
              </span>
            )}
            {photos.length > 0 && (
              <span className="text-xs font-medium text-primary">
                {photos.length} photo{photos.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={post.type === "event" ? "default" : "secondary"}
              className="text-xs"
            >
              {post.type === "event" ? "Event" : "News"}
            </Badge>
            {post.status === "draft" && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Draft
              </Badge>
            )}
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(post)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(post)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Title & description */}
        <div className="px-5 pb-3">
          <h3 className="text-lg font-semibold leading-tight">{post.title}</h3>
          {post.description && (
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {post.description}
            </p>
          )}
        </div>

        {/* Photo grid */}
        {visiblePhotos.length > 0 && (
          <div className="px-5 pb-4">
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {visiblePhotos.map((photo, i) => {
                const isLast = i === GRID_VISIBLE - 1 && overflowCount > 0;
                return (
                  <button
                    key={photo.id}
                    className="relative aspect-square overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={() => openLightbox(i)}
                  >
                    <Image
                      src={photo.url}
                      alt={photo.caption ?? `Photo ${i + 1}`}
                      fill
                      sizes="120px"
                      className="object-cover transition-opacity hover:opacity-90"
                    />
                    {isLast && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm font-semibold">
                        +{overflowCount}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {photos.length > GRID_VISIBLE && (
              <button
                className="mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => openLightbox(0)}
              >
                View all {photos.length} photos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>{post.title} — photos</DialogTitle>
          </DialogHeader>
          <div className="relative flex flex-col">
            {/* Main image */}
            <div className="relative aspect-video w-full bg-black">
              {photos[lightboxIndex] && (
                <Image
                  src={photos[lightboxIndex].url}
                  alt={photos[lightboxIndex].caption ?? `Photo ${lightboxIndex + 1}`}
                  fill
                  sizes="800px"
                  className="object-contain"
                />
              )}
              {/* Prev / Next */}
              {photos.length > 1 && (
                <>
                  <button
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-2 py-1 text-white hover:bg-black/70"
                    onClick={() =>
                      setLightboxIndex((prev) => (prev - 1 + photos.length) % photos.length)
                    }
                  >
                    ‹
                  </button>
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-2 py-1 text-white hover:bg-black/70"
                    onClick={() =>
                      setLightboxIndex((prev) => (prev + 1) % photos.length)
                    }
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {/* Caption & counter */}
            <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
              <span>{photos[lightboxIndex]?.caption ?? ""}</span>
              <span>
                {lightboxIndex + 1} / {photos.length}
              </span>
            </div>
            {/* Thumbnail strip */}
            {photos.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto px-4 pb-3">
                {photos.map((photo, i) => (
                  <button
                    key={photo.id}
                    className={`relative h-12 w-12 shrink-0 overflow-hidden rounded border-2 transition-colors ${
                      i === lightboxIndex ? "border-primary" : "border-transparent"
                    }`}
                    onClick={() => setLightboxIndex(i)}
                  >
                    <Image
                      src={photo.url}
                      alt={photo.caption ?? `Thumb ${i + 1}`}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
