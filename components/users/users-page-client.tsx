"use client";

import * as React from "react";
import { format } from "date-fns";
import { ShieldCheck, UserCircle2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useProfiles,
  useToggleProfileActive,
  useUpdateProfileRole,
} from "@/lib/hooks/use-profiles";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/types";

const roles = Object.keys(USER_ROLE_LABELS) as UserRole[];

export function UsersPageClient() {
  const { data: profiles, isLoading } = useProfiles();
  const updateRole = useUpdateProfileRole();
  const toggleActive = useToggleProfileActive();

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
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !profiles || profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
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
                          <div className="font-medium">
                            {p.full_name || p.email}
                          </div>
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
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) =>
                          toggleActive.mutate({ id: p.id, is_active: v })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "PP")}
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
