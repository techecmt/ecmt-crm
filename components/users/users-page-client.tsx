"use client";

import * as React from "react";
import { format } from "date-fns";
import { Pencil, ShieldCheck, Trash2, UserCircle2, UserX } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeleteUser,
  useProfiles,
  useSetUserAuthAccess,
  useUpdateProfileName,
  useUpdateProfileRole,
} from "@/lib/hooks/use-profiles";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/types";
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

const roles = Object.keys(USER_ROLE_LABELS) as UserRole[];

type UsersPageClientProps = {
  currentUserId: string;
  canManageAuth: boolean;
};

export function UsersPageClient({
  currentUserId,
  canManageAuth,
}: UsersPageClientProps) {
  const { data: profiles, isLoading } = useProfiles();
  const updateRole = useUpdateProfileRole();
  const updateName = useUpdateProfileName();
  const setUserAuthAccess = useSetUserAuthAccess();
  const deleteUser = useDeleteUser();

  const [editingNameFor, setEditingNameFor] = React.useState<string | null>(null);
  const [nameDraft, setNameDraft] = React.useState("");
  const [authConfirmUserId, setAuthConfirmUserId] = React.useState<string | null>(null);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = React.useState<string | null>(null);

  const authConfirmUser =
    profiles?.find((profile) => profile.id === authConfirmUserId) ?? null;
  const deleteConfirmUser =
    profiles?.find((profile) => profile.id === deleteConfirmUserId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Manage roles and access for your organization.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Team members
          </CardTitle>
          <CardDescription>
            Users sign up themselves; the first user becomes a Super Admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Auth access</TableHead>
                <TableHead className="text-right">Joined</TableHead>
                <TableHead className="w-[300px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !profiles || profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No users.
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {(p.full_name || p.email).charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          {editingNameFor === p.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                className="h-8 w-[220px]"
                                placeholder="Full name"
                              />
                              <Button
                                size="sm"
                                onClick={async () => {
                                  await updateName.mutateAsync({
                                    id: p.id,
                                    full_name: nameDraft,
                                  });
                                  setEditingNameFor(null);
                                  setNameDraft("");
                                }}
                                disabled={updateName.isPending}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingNameFor(null);
                                  setNameDraft("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="font-medium">{p.full_name || p.email}</div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {p.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={p.role}
                        onValueChange={(v) =>
                          updateRole.mutate({ id: p.id, role: v as UserRole })
                        }
                      >
                        <SelectTrigger className="h-8 w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {USER_ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>
                        {p.is_active ? "Enabled" : "Removed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "PP")}
                    </TableCell>
                    <TableCell>
                      {canManageAuth ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingNameFor(p.id);
                              setNameDraft(p.full_name ?? "");
                            }}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Rename
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAuthConfirmUserId(p.id)}
                            disabled={setUserAuthAccess.isPending}
                          >
                            <UserX className="mr-1.5 h-3.5 w-3.5" />
                            {p.is_active ? "Remove auth" : "Restore auth"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteConfirmUserId(p.id)}
                            disabled={p.id === currentUserId}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Super Admin required for auth/delete actions.
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCircle2 className="h-4 w-4" />
            Roles
          </CardTitle>
          <CardDescription>What each role can do.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <div
              key={r}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <div className="text-sm font-medium">{USER_ROLE_LABELS[r]}</div>
                <p className="text-xs text-muted-foreground">
                  {ROLE_DESCRIPTIONS[r]}
                </p>
              </div>
              <Badge variant="outline">{r}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!authConfirmUser}
        onOpenChange={(open) => !open && setAuthConfirmUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {authConfirmUser?.is_active ? "Remove auth access?" : "Restore auth access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {authConfirmUser?.is_active
                ? `This will prevent ${authConfirmUser?.full_name || authConfirmUser?.email} from signing in.`
                : `This will allow ${authConfirmUser?.full_name || authConfirmUser?.email} to sign in again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!authConfirmUser) return;
                await setUserAuthAccess.mutateAsync({
                  id: authConfirmUser.id,
                  auth_enabled: !authConfirmUser.is_active,
                });
                setAuthConfirmUserId(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteConfirmUser}
        onOpenChange={(open) => !open && setDeleteConfirmUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes both profile and authentication for{" "}
              <span className="font-medium">
                {deleteConfirmUser?.full_name || deleteConfirmUser?.email}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteConfirmUser) return;
                await deleteUser.mutateAsync(deleteConfirmUser.id);
                setDeleteConfirmUserId(null);
              }}
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: "Full access including user management.",
  management: "Org-wide visibility, manage colleges and users.",
  admission_manager: "Run admissions team, edit colleges.",
  counsellor: "Work leads, schedule follow-ups.",
  marketing: "Manage campaigns and source attribution.",
  staff_viewer: "Read-only access to dashboards.",
};
