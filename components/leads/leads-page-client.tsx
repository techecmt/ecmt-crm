"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowUpDown,
  Building2,
  ChevronRight,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  UserCircle2,
  Users,
  X,
} from "lucide-react";

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
  useBulkUpdateLeads,
  useDeleteLead,
  useLeads,
  type LeadFilters,
} from "@/lib/hooks/use-leads";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  PIPELINE_LEAD_STATUSES,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from "@/lib/types";
import { LeadFormSheet } from "@/components/leads/lead-form-sheet";
import { LeadStatusSelect } from "@/components/leads/status-select";
import { cn } from "@/lib/utils";

const statuses = PIPELINE_LEAD_STATUSES;
const sources = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];
const NO_BULK_CHANGE = "__no_change";

type SortKey = "created_at" | "full_name" | "lead_score" | "status" | "source";
type SortDir = "asc" | "desc";

type ExpertSearchState = {
  mustInclude: string;
  exclude: string;
  city: string;
  interestedCourse: string;
  campaign: string;
  minScore: string;
  maxScore: string;
  hasEmailOnly: boolean;
  duplicatesOnly: boolean;
};

const defaultExpertSearch: ExpertSearchState = {
  mustInclude: "",
  exclude: "",
  city: "",
  interestedCourse: "",
  campaign: "",
  minScore: "",
  maxScore: "",
  hasEmailOnly: false,
  duplicatesOnly: false,
};

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
  const [expertSearchOpen, setExpertSearchOpen] = React.useState(false);
  const [expertSearch, setExpertSearch] =
    React.useState<ExpertSearchState>(defaultExpertSearch);
  const [sortKey, setSortKey] = React.useState<SortKey>("created_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [selectedLeadIds, setSelectedLeadIds] = React.useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = React.useState<LeadStatus | "">("");
  const [bulkCounsellor, setBulkCounsellor] = React.useState(NO_BULK_CHANGE);
  const {
    data: leads,
    isLoading,
    isFetching,
    refetch,
  } = useLeads({ ...filters, search: debouncedSearch });
  const { data: colleges } = useColleges();
  const { data: profiles } = useProfiles();
  const bulkUpdateLeads = useBulkUpdateLeads();
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

  const filteredLeads = React.useMemo(() => {
    const currentLeads = leads ?? [];
    if (!currentLeads.length) return [];

    const includeTerms = expertSearch.mustInclude
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const excludeTerms = expertSearch.exclude
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const city = expertSearch.city.trim().toLowerCase();
    const course = expertSearch.interestedCourse.trim().toLowerCase();
    const campaign = expertSearch.campaign.trim().toLowerCase();
    const minScore = expertSearch.minScore.trim()
      ? Number(expertSearch.minScore)
      : null;
    const maxScore = expertSearch.maxScore.trim()
      ? Number(expertSearch.maxScore)
      : null;

    return currentLeads.filter((lead) => {
      const haystack = [
        lead.full_name,
        lead.phone,
        lead.email ?? "",
        lead.city ?? "",
        lead.interested_course ?? "",
        lead.campaign ?? "",
        lead.utm_source ?? "",
        lead.utm_medium ?? "",
        lead.utm_campaign ?? "",
        lead.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const includesAllTerms = includeTerms.every((term) => haystack.includes(term));
      if (!includesAllTerms) return false;

      const hasExcludedTerms = excludeTerms.some((term) => haystack.includes(term));
      if (hasExcludedTerms) return false;

      if (city && !(lead.city ?? "").toLowerCase().includes(city)) return false;
      if (course && !(lead.interested_course ?? "").toLowerCase().includes(course)) {
        return false;
      }
      if (campaign && !(lead.campaign ?? "").toLowerCase().includes(campaign)) {
        return false;
      }
      if (minScore !== null && !Number.isNaN(minScore) && lead.lead_score < minScore) {
        return false;
      }
      if (maxScore !== null && !Number.isNaN(maxScore) && lead.lead_score > maxScore) {
        return false;
      }
      if (expertSearch.hasEmailOnly && !lead.email) return false;
      if (expertSearch.duplicatesOnly && !lead.is_duplicate) return false;

      return true;
    });
  }, [expertSearch, leads]);

  const sortedLeads = React.useMemo(() => {
    const list = [...filteredLeads];
    list.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortKey === "created_at") {
        return (
          (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
        );
      }
      if (sortKey === "full_name") {
        return a.full_name.localeCompare(b.full_name) * direction;
      }
      if (sortKey === "lead_score") {
        return (a.lead_score - b.lead_score) * direction;
      }
      if (sortKey === "status") {
        return LEAD_STATUS_LABELS[a.status].localeCompare(LEAD_STATUS_LABELS[b.status]) * direction;
      }
      return LEAD_SOURCE_LABELS[a.source].localeCompare(LEAD_SOURCE_LABELS[b.source]) * direction;
    });
    return list;
  }, [filteredLeads, sortDir, sortKey]);

  React.useEffect(() => {
    const visibleIds = new Set(sortedLeads.map((lead) => lead.id));
    setSelectedLeadIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [sortedLeads]);

  const allVisibleSelected =
    sortedLeads.length > 0 && sortedLeads.every((lead) => selectedLeadIds.includes(lead.id));
  const someVisibleSelected =
    sortedLeads.some((lead) => selectedLeadIds.includes(lead.id)) && !allVisibleSelected;

  const selectedLeadsCount = selectedLeadIds.length;
  const statusCounts = React.useMemo(() => {
    const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
      LeadStatus,
      number
    >;
    (leads ?? []).forEach((lead) => {
      if (lead.status in counts) {
        counts[lead.status] += 1;
      }
    });
    return counts;
  }, [leads]);
  const totalLeadCount = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

  const onToggleAllVisible = (checked: boolean | "indeterminate") => {
    if (!checked) {
      setSelectedLeadIds([]);
      return;
    }
    setSelectedLeadIds(sortedLeads.map((lead) => lead.id));
  };

  const onToggleLead = (leadId: string, checked: boolean | "indeterminate") => {
    if (!checked) {
      setSelectedLeadIds((prev) => prev.filter((id) => id !== leadId));
      return;
    }
    setSelectedLeadIds((prev) => (prev.includes(leadId) ? prev : [...prev, leadId]));
  };

  const applyBulkUpdates = async () => {
    await bulkUpdateLeads.mutateAsync({
      ids: selectedLeadIds,
      status: bulkStatus || undefined,
      assignedCounsellor:
        bulkCounsellor === NO_BULK_CHANGE
          ? undefined
          : (bulkCounsellor as string | "unassigned"),
    });
    setSelectedLeadIds([]);
    setBulkStatus("");
    setBulkCounsellor(NO_BULK_CHANGE);
  };

  const resetExpertSearch = () => {
    setExpertSearch(defaultExpertSearch);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            All inquiries across all colleges, with smart filtering and bulk actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await refetch();
              router.refresh();
            }}
            disabled={isFetching}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add lead
          </Button>
        </div>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base">Search, filter & sort</CardTitle>
          <CardDescription>
            Stripe-style controls for quick slicing, ranking, and expert-level querying.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="button"
              variant={filters.status === "all" ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-full px-3"
              onClick={() => setFilters((f) => ({ ...f, status: "all" }))}
            >
              All
              <Badge variant="secondary" className="ml-2 h-5 rounded-full px-2 text-xs">
                {totalLeadCount}
              </Badge>
            </Button>
            {statuses.map((status) => (
              <Button
                key={status}
                type="button"
                variant={filters.status === status ? "default" : "outline"}
                size="sm"
                className="h-8 rounded-full px-3"
                onClick={() => setFilters((f) => ({ ...f, status }))}
              >
                {LEAD_STATUS_LABELS[status]}
                <Badge variant="secondary" className="ml-2 h-5 rounded-full px-2 text-xs">
                  {statusCounts[status]}
                </Badge>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email…"
                className="pl-9"
              />
            </div>
            <div className="lg:col-span-2">
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Created date</SelectItem>
                  <SelectItem value="full_name">Lead name</SelectItem>
                  <SelectItem value="lead_score">Lead score</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="source">Source</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="lg:col-span-1"
              onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
            >
              <ArrowUpDown className="mr-2 h-4 w-4" />
              {sortDir === "asc" ? "Asc" : "Desc"}
            </Button>
            <Select
              value={filters.source ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, source: v as LeadSource | "all" }))
              }
            >
              <SelectTrigger className="lg:col-span-2">
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
              <SelectTrigger className="lg:col-span-2">
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
              <SelectTrigger className="lg:col-span-2">
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
            <Button
              variant={expertSearchOpen ? "default" : "outline"}
              className="lg:col-span-1"
              onClick={() => setExpertSearchOpen((open) => !open)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Expert
            </Button>
          </div>

          {expertSearchOpen ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">Expert search</div>
                <Button variant="ghost" size="sm" onClick={resetExpertSearch}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <Input
                  value={expertSearch.mustInclude}
                  onChange={(e) =>
                    setExpertSearch((prev) => ({ ...prev, mustInclude: e.target.value }))
                  }
                  placeholder="Must include terms (space separated)"
                />
                <Input
                  value={expertSearch.exclude}
                  onChange={(e) =>
                    setExpertSearch((prev) => ({ ...prev, exclude: e.target.value }))
                  }
                  placeholder="Exclude terms"
                />
                <Input
                  value={expertSearch.city}
                  onChange={(e) =>
                    setExpertSearch((prev) => ({ ...prev, city: e.target.value }))
                  }
                  placeholder="City contains"
                />
                <Input
                  value={expertSearch.interestedCourse}
                  onChange={(e) =>
                    setExpertSearch((prev) => ({
                      ...prev,
                      interestedCourse: e.target.value,
                    }))
                  }
                  placeholder="Course contains"
                />
                <Input
                  value={expertSearch.campaign}
                  onChange={(e) =>
                    setExpertSearch((prev) => ({ ...prev, campaign: e.target.value }))
                  }
                  placeholder="Campaign contains"
                />
                <Input
                  type="number"
                  value={expertSearch.minScore}
                  onChange={(e) =>
                    setExpertSearch((prev) => ({ ...prev, minScore: e.target.value }))
                  }
                  placeholder="Min score"
                />
                <Input
                  type="number"
                  value={expertSearch.maxScore}
                  onChange={(e) =>
                    setExpertSearch((prev) => ({ ...prev, maxScore: e.target.value }))
                  }
                  placeholder="Max score"
                />
                <div className="flex items-center gap-4 rounded-md border bg-background px-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={expertSearch.hasEmailOnly}
                      onCheckedChange={(checked) =>
                        setExpertSearch((prev) => ({
                          ...prev,
                          hasEmailOnly: !!checked,
                        }))
                      }
                    />
                    Has email
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={expertSearch.duplicatesOnly}
                      onCheckedChange={(checked) =>
                        setExpertSearch((prev) => ({
                          ...prev,
                          duplicatesOnly: !!checked,
                        }))
                      }
                    />
                    Duplicates only
                  </label>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedLeadsCount > 0 ? (
        <Card className="border-primary/30 bg-primary/[0.03] shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            <Badge variant="secondary" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {selectedLeadsCount} selected
            </Badge>
            <Select
              value={bulkStatus || NO_BULK_CHANGE}
              onValueChange={(value) =>
                setBulkStatus(value === NO_BULK_CHANGE ? "" : (value as LeadStatus))
              }
            >
              <SelectTrigger className="h-8 w-[230px]">
                <SelectValue placeholder="Bulk status change" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BULK_CHANGE}>No status change</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={bulkCounsellor} onValueChange={setBulkCounsellor}>
              <SelectTrigger className="h-8 w-[230px]">
                <SelectValue placeholder="Bulk counsellor update" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BULK_CHANGE}>No counsellor change</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {counsellors.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={applyBulkUpdates}
              disabled={
                bulkUpdateLeads.isPending ||
                (!bulkStatus && bulkCounsellor === NO_BULK_CHANGE)
              }
            >
              Apply bulk update
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedLeadIds([])}>
              Clear selection
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected || (someVisibleSelected ? "indeterminate" : false)}
                  onCheckedChange={onToggleAllVisible}
                  aria-label="Select all leads"
                />
              </TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Course / College</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Counsellor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !sortedLeads || sortedLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            ) : (
              sortedLeads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className={cn(
                    "transition-colors",
                    selectedLeadIds.includes(lead.id) && "bg-primary/[0.05]",
                  )}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedLeadIds.includes(lead.id)}
                      onCheckedChange={(checked) => onToggleLead(lead.id, checked)}
                      aria-label={`Select ${lead.full_name}`}
                    />
                  </TableCell>
                  <TableCell onClick={() => router.push(`/dashboard/leads/${lead.id}`)}>
                    <div className="font-medium">{lead.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.phone}
                      {lead.email ? ` · ${lead.email}` : ""}
                    </div>
                  </TableCell>
                  <TableCell onClick={() => router.push(`/dashboard/leads/${lead.id}`)}>
                    <div className="text-sm">{lead.interested_course ?? "—"}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {lead.college?.name ?? "Unassigned college"}
                    </div>
                  </TableCell>
                  <TableCell>{LEAD_SOURCE_LABELS[lead.source]}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {lead.counsellor?.full_name || lead.counsellor?.email || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <LeadStatusSelect lead={lead} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={lead.lead_score >= 80 ? "default" : "secondary"}>
                      {lead.lead_score}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {format(new Date(lead.created_at), "PP")}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
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
