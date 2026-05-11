"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  Building2,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useColleges } from "@/lib/hooks/use-colleges";
import {
  useDeleteLead,
  useLeads,
  useUpdateLeadStatus,
  type LeadFilters,
} from "@/lib/hooks/use-leads";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from "@/lib/types";
import { LeadFormSheet } from "@/components/leads/lead-form-sheet";
import { LeadStatusBadge } from "@/components/leads/status-badge";

const statuses = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];
const sources = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];

export function LeadsPageClient({ canDelete }: { canDelete: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [filters, setFilters] = React.useState<LeadFilters>({
    status: "all",
    source: "all",
    collegeId: "all",
    counsellorId: "all",
  });
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const { data: leads, isLoading } = useLeads({ ...filters, search: debouncedSearch });
  const { data: colleges } = useColleges();
  const { data: profiles } = useProfiles();
  const updateStatus = useUpdateLeadStatus();
  const deleteLead = useDeleteLead();

  const [editingLead, setEditingLead] = React.useState<Lead | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Lead | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    if (params.get("new") === "1") {
      setCreating(true);
      router.replace("/dashboard/leads");
    }
  }, [params, router]);

  const counsellors = (profiles ?? []).filter(
    (p) =>
      p.is_active &&
      ["counsellor", "admission_manager", "management", "super_admin"].includes(p.role),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            All inquiries across all colleges.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add lead
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email…"
                className="pl-9"
              />
            </div>
            <Select
              value={filters.status ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, status: v as LeadStatus | "all" }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.source ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, source: v as LeadSource | "all" }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_SOURCE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.collegeId ?? "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, collegeId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="College" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All colleges</SelectItem>
                {(colleges ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.counsellorId ?? "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, counsellorId: v }))}
            >
              <SelectTrigger className="md:col-span-1">
                <SelectValue placeholder="Counsellor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All counsellors</SelectItem>
                {counsellors.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Course / College</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Counsellor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !leads || leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer">
                  <TableCell
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    <div className="font-medium">{lead.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.phone}
                      {lead.email ? ` · ${lead.email}` : ""}
                    </div>
                  </TableCell>
                  <TableCell
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    <div className="text-sm">
                      {lead.interested_course ?? "—"}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {lead.college?.name ?? "Unassigned college"}
                    </div>
                  </TableCell>
                  <TableCell>{LEAD_SOURCE_LABELS[lead.source]}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {lead.counsellor?.full_name ||
                        lead.counsellor?.email ||
                        "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={lead.status}
                      onValueChange={(v) =>
                        updateStatus.mutate({
                          id: lead.id,
                          status: v as LeadStatus,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-[170px] text-xs">
                        <SelectValue asChild>
                          <span>
                            <LeadStatusBadge status={lead.status} />
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LEAD_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {format(new Date(lead.created_at), "PP")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/leads/${lead.id}`}>
                            <ChevronRight className="mr-2 h-4 w-4" />
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingLead(lead)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {canDelete ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setConfirmDelete(lead)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <LeadFormSheet open={creating} onOpenChange={setCreating} lead={null} />
      <LeadFormSheet
        open={!!editingLead}
        onOpenChange={(open) => !open && setEditingLead(null)}
        lead={editingLead}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium">{confirmDelete?.full_name}</span> and all
              related activities and follow-ups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                await deleteLead.mutateAsync(confirmDelete.id);
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
