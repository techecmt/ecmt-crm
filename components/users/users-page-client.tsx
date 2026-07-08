"use client";

import * as React from "react";
import {
  Mail,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserCircle2,
  UserX,
} from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useInviteUser,
  useProfiles,
  useSetUserAuthAccess,
  useUpdateModulePermissions,
  useUpdateProfileName,
  useUpdateProfileRole,
} from "@/lib/hooks/use-profiles";
import {
  ALL_MODULES,
  APP_MODULE_LABELS,
  DEFAULT_MODULES,
  USER_ROLE_LABELS,
  getUserModules,
  isAdminRole,
  type AppModule,
  type UserRole,
} from "@/lib/types";
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
import { formatSgtDate } from "@/lib/timezone";

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
  const inviteUser = useInviteUser();
  const updateModules = useUpdateModulePermissions();

  const [editingNameFor, setEditingNameFor] = React.useState<string | null>(null);
  const [nameDraft, setNameDraft] = React.useState("");
  const [authConfirmUserId, setAuthConfirmUserId] = React.useState<string | null>(null);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [modulesDialogUser, setModulesDialogUser] = React.useState<string | null>(null);

  const authConfirmUser =
    profiles?.find((profile) => profile.id === authConfirmUserId) ?? null;
  const deleteConfirmUser =
    profiles?.find((profile) => profile.id === deleteConfirmUserId) ?? null;
  const modulesUser =
    profiles?.find((profile) => profile.id === modulesDialogUser) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage roles, access, and module visibility for your team.
          </p>
        </div>
        {canManageAuth && (
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Invite User
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Team members
          </CardTitle>
          <CardDescription>
            Users can sign up or be invited by an admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Auth access</TableHead>
                <TableHead>Modules</TableHead>
                <TableHead className="text-right">Joined</TableHead>
                <TableHead className="w-[320px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !profiles || profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No users.
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((p) => {
                  const visibleModules = getUserModules(p);
                  return (
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
                        {canManageAuth ? (
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
                        ) : (
                          <Badge variant="outline">{USER_ROLE_LABELS[p.role]}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "secondary"}>
                          {p.is_active ? "Enabled" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isAdminRole(p.role) ? (
                          <span className="text-xs text-muted-foreground">All modules</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {visibleModules.length <= 3 ? (
                              visibleModules.map((m) => (
                                <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">
                                  {APP_MODULE_LABELS[m]}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {visibleModules.length} modules
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatSgtDate(p.created_at)}
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
                            {!isAdminRole(p.role) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setModulesDialogUser(p.id)}
                              >
                                <Shield className="mr-1.5 h-3.5 w-3.5" />
                                Modules
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAuthConfirmUserId(p.id)}
                              disabled={setUserAuthAccess.isPending}
                            >
                              <UserX className="mr-1.5 h-3.5 w-3.5" />
                              {p.is_active ? "Disable" : "Restore"}
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
                            Admin required for management actions.
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
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

      {/* Invite User Dialog */}
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={async (data) => {
          await inviteUser.mutateAsync(data);
          setInviteOpen(false);
        }}
        isPending={inviteUser.isPending}
      />

      {/* Module Permissions Dialog */}
      {modulesUser && (
        <ModulePermissionsDialog
          open={!!modulesUser}
          onOpenChange={(open) => !open && setModulesDialogUser(null)}
          user={modulesUser}
          onSave={async (modules) => {
            await updateModules.mutateAsync({
              id: modulesUser.id,
              module_permissions: modules,
            });
            setModulesDialogUser(null);
          }}
          isPending={updateModules.isPending}
        />
      )}

      {/* Auth toggle confirmation */}
      <AlertDialog
        open={!!authConfirmUser}
        onOpenChange={(open) => !open && setAuthConfirmUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {authConfirmUser?.is_active ? "Disable auth access?" : "Restore auth access?"}
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

      {/* Delete user confirmation */}
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

/* ------------------------------------------------------------------ */
/*  Invite User Dialog                                                 */
/* ------------------------------------------------------------------ */

function InviteUserDialog({
  open,
  onOpenChange,
  onInvite,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvite: (data: {
    email: string;
    full_name: string;
    role: UserRole;
    module_permissions: AppModule[] | null;
  }) => Promise<void>;
  isPending: boolean;
}) {
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("staff_viewer");
  const [selectedModules, setSelectedModules] = React.useState<AppModule[]>([...DEFAULT_MODULES]);

  const isAdmin = isAdminRole(role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onInvite({
      email,
      full_name: fullName,
      role,
      module_permissions: isAdmin ? null : selectedModules,
    });
    setEmail("");
    setFullName("");
    setRole("staff_viewer");
    setSelectedModules([...DEFAULT_MODULES]);
  };

  const toggleModule = (mod: AppModule) => {
    setSelectedModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Invite User
          </DialogTitle>
          <DialogDescription>
            Send an invitation email. The user will set their own password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="invite-name">Full Name</Label>
              <Input
                id="invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger>
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
            </div>
            {!isAdmin && (
              <div className="grid gap-2">
                <Label>Visible Modules</Label>
                <p className="text-xs text-muted-foreground">
                  Select which sections this user can access.
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                  {ALL_MODULES.map((mod) => (
                    <label
                      key={mod}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedModules.includes(mod)}
                        onCheckedChange={() => toggleModule(mod)}
                      />
                      {APP_MODULE_LABELS[mod]}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Module Permissions Dialog                                          */
/* ------------------------------------------------------------------ */

function ModulePermissionsDialog({
  open,
  onOpenChange,
  user,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: { id: string; full_name: string | null; email: string; module_permissions: AppModule[] | null };
  onSave: (modules: AppModule[] | null) => Promise<void>;
  isPending: boolean;
}) {
  const currentModules = user.module_permissions ?? [...DEFAULT_MODULES];
  const [selected, setSelected] = React.useState<AppModule[]>(currentModules);

  React.useEffect(() => {
    setSelected(user.module_permissions ?? [...DEFAULT_MODULES]);
  }, [user.id, user.module_permissions]);

  const toggleModule = (mod: AppModule) => {
    setSelected((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const selectAll = () => setSelected([...ALL_MODULES]);
  const deselectAll = () => setSelected([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Module Access
          </DialogTitle>
          <DialogDescription>
            Control which modules{" "}
            <span className="font-medium">{user.full_name || user.email}</span>{" "}
            can see in the sidebar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAll}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={deselectAll}>
              Deselect all
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
            {ALL_MODULES.map((mod) => (
              <label
                key={mod}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={selected.includes(mod)}
                  onCheckedChange={() => toggleModule(mod)}
                />
                {APP_MODULE_LABELS[mod]}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await onSave(selected);
            }}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
