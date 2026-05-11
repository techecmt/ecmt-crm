"use client";

import * as React from "react";
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useColleges,
  useDeleteCollege,
} from "@/lib/hooks/use-colleges";
import type { College } from "@/lib/types";
import { CollegeFormDialog } from "@/components/colleges/college-form-dialog";

export function CollegesPageClient({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useColleges();
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<College | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<College | null>(null);
  const deleteMutation = useDeleteCollege();

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((c) =>
      [c.name, c.code, c.city, c.state]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(term)),
    );
  }, [data, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Colleges</h1>
          <p className="text-sm text-muted-foreground">
            Manage all colleges across the organization.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add college
          </Button>
        ) : null}
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search colleges by name, code, city…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {search ? "No colleges match your search." : "No colleges yet."}
            </div>
            {canManage && !search ? (
              <Button onClick={() => setCreating(true)} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add your first college
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((college) => (
            <Card key={college.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">{college.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {college.code ?? "—"}
                  </CardDescription>
                </div>
                <Badge variant={college.is_active ? "default" : "secondary"}>
                  {college.is_active ? "Active" : "Inactive"}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                <div className="space-y-1 text-muted-foreground">
                  {college.city || college.state ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>
                        {[college.city, college.state].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  ) : null}
                  {college.contact_phone ? (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{college.contact_phone}</span>
                    </div>
                  ) : null}
                  {college.contact_email ? (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{college.contact_email}</span>
                    </div>
                  ) : null}
                  {college.website ? (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5" />
                      <a
                        href={college.website}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate underline-offset-4 hover:underline"
                      >
                        {college.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  ) : null}
                </div>
                {college.courses.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {college.courses.slice(0, 4).map((course) => (
                      <Badge key={course} variant="outline" className="text-[10px]">
                        {course}
                      </Badge>
                    ))}
                    {college.courses.length > 4 ? (
                      <Badge variant="outline" className="text-[10px]">
                        +{college.courses.length - 4}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                {canManage ? (
                  <div className="mt-auto flex justify-end gap-2 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(college)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(college)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CollegeFormDialog
        open={creating}
        onOpenChange={setCreating}
        college={null}
      />
      <CollegeFormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        college={editing}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete college?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium">{confirmDelete?.name}</span>. Linked
              leads will keep their data but lose the college reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                await deleteMutation.mutateAsync(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
