"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowUpDown,
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Filter,
  ListChecks,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  UserCircle2,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useColleges } from "@/lib/hooks/use-colleges";
import {
  useBulkUpdateLeads,
  useDeleteLead,
  useLeads,
  UNASSIGNED_COUNSELLOR,
  type LeadFilters,
  type LeadWithRelations,
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
import { WhatsAppPhoneLink } from "@/components/phone/whatsapp-phone-link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statuses = PIPELINE_LEAD_STATUSES;
const sources = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];
const NO_BULK_CHANGE = "__no_change";

function getFollowUpCounts(lead: LeadWithRelations) {
  const list = lead.follow_ups ?? [];
  const total = list.length;
  const completed = list.filter((followUp) => followUp.status === "completed").length;
  return { total, completed };
}

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

type ExportColumnKey =
  | "id"
  | "full_name"
  | "first_name"
  | "last_name"
  | "phone"
  | "whatsapp_link"
  | "email"
  | "city"
  | "nationality"
  | "nationality_other"
  | "highest_qualification"
  | "highest_qualification_other"
  | "interested_course"
  | "source"
  | "status"
  | "admission_stage"
  | "assigned_counsellor"
  | "assigned_counsellor_name"
  | "college_id"
  | "college_name"
  | "description"
  | "follow_up_date"
  | "lead_score"
  | "campaign"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "is_duplicate"
  | "counselling_completed_at"
  | "registration_completed_at"
  | "not_interested_reason"
  | "not_interested_notes"
  | "created_by"
  | "created_at"
  | "updated_at";

type ExportFieldType = "text" | "number" | "boolean" | "date";
type ExportMatchMode = "all" | "any";
type ExportOperator =
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_empty"
  | "is_not_empty";

type ExportFilterRule = {
  id: string;
  field: ExportColumnKey;
  operator: ExportOperator;
  value: string;
};

type ExportColumnDefinition = {
  key: ExportColumnKey;
  label: string;
  fieldType: ExportFieldType;
  group: "default" | "whatsapp";
  getRawValue: (lead: LeadWithRelations) => string | number | boolean | null;
};

const EXPORT_COLUMN_DEFINITIONS: ExportColumnDefinition[] = [
  { key: "id", label: "Lead ID", fieldType: "text", group: "default", getRawValue: (lead) => lead.id },
  { key: "full_name", label: "Full Name", fieldType: "text", group: "default", getRawValue: (lead) => lead.full_name },
  { key: "first_name", label: "First Name", fieldType: "text", group: "default", getRawValue: (lead) => lead.first_name ?? null },
  { key: "last_name", label: "Last Name", fieldType: "text", group: "default", getRawValue: (lead) => lead.last_name ?? null },
  { key: "phone", label: "Phone", fieldType: "text", group: "default", getRawValue: (lead) => lead.phone },
  {
    key: "whatsapp_link",
    label: "WhatsApp Link",
    fieldType: "text",
    group: "whatsapp",
    getRawValue: (lead) => `https://wa.me/${lead.phone.replace(/\D/g, "")}`,
  },
  { key: "email", label: "Email", fieldType: "text", group: "default", getRawValue: (lead) => lead.email ?? null },
  { key: "city", label: "City", fieldType: "text", group: "default", getRawValue: (lead) => lead.city ?? null },
  { key: "nationality", label: "Nationality", fieldType: "text", group: "default", getRawValue: (lead) => lead.nationality ?? null },
  {
    key: "nationality_other",
    label: "Nationality (Other)",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.nationality_other ?? null,
  },
  {
    key: "highest_qualification",
    label: "Highest Qualification",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.highest_qualification ?? null,
  },
  {
    key: "highest_qualification_other",
    label: "Highest Qualification (Other)",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.highest_qualification_other ?? null,
  },
  {
    key: "interested_course",
    label: "Interested Course",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.interested_course ?? null,
  },
  {
    key: "source",
    label: "Source",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => LEAD_SOURCE_LABELS[lead.source],
  },
  {
    key: "status",
    label: "Status",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => LEAD_STATUS_LABELS[lead.status],
  },
  {
    key: "admission_stage",
    label: "Admission Stage",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.admission_stage ?? null,
  },
  {
    key: "assigned_counsellor",
    label: "Assigned Counsellor ID",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.assigned_counsellor ?? null,
  },
  {
    key: "assigned_counsellor_name",
    label: "Assigned Counsellor",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.counsellor?.full_name || lead.counsellor?.email || null,
  },
  {
    key: "college_id",
    label: "College ID",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.college_id ?? null,
  },
  {
    key: "college_name",
    label: "College",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.college?.name ?? null,
  },
  {
    key: "description",
    label: "Description",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.description ?? null,
  },
  {
    key: "follow_up_date",
    label: "Follow Up Date",
    fieldType: "date",
    group: "default",
    getRawValue: (lead) => lead.follow_up_date ?? null,
  },
  {
    key: "lead_score",
    label: "Lead Score",
    fieldType: "number",
    group: "default",
    getRawValue: (lead) => lead.lead_score,
  },
  {
    key: "campaign",
    label: "Campaign",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.campaign ?? null,
  },
  {
    key: "utm_source",
    label: "UTM Source",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.utm_source ?? null,
  },
  {
    key: "utm_medium",
    label: "UTM Medium",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.utm_medium ?? null,
  },
  {
    key: "utm_campaign",
    label: "UTM Campaign",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.utm_campaign ?? null,
  },
  {
    key: "is_duplicate",
    label: "Is Duplicate",
    fieldType: "boolean",
    group: "default",
    getRawValue: (lead) => lead.is_duplicate,
  },
  {
    key: "counselling_completed_at",
    label: "Counselling Completed At",
    fieldType: "date",
    group: "default",
    getRawValue: (lead) => lead.counselling_completed_at ?? null,
  },
  {
    key: "registration_completed_at",
    label: "Registration Completed At",
    fieldType: "date",
    group: "default",
    getRawValue: (lead) => lead.registration_completed_at ?? null,
  },
  {
    key: "not_interested_reason",
    label: "Not Interested Reason",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.not_interested_reason ?? null,
  },
  {
    key: "not_interested_notes",
    label: "Not Interested Notes",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.not_interested_notes ?? null,
  },
  {
    key: "created_by",
    label: "Created By",
    fieldType: "text",
    group: "default",
    getRawValue: (lead) => lead.created_by ?? null,
  },
  {
    key: "created_at",
    label: "Created At",
    fieldType: "date",
    group: "default",
    getRawValue: (lead) => lead.created_at,
  },
  {
    key: "updated_at",
    label: "Updated At",
    fieldType: "date",
    group: "default",
    getRawValue: (lead) => lead.updated_at,
  },
];

const EXPORT_COLUMN_MAP = Object.fromEntries(
  EXPORT_COLUMN_DEFINITIONS.map((column) => [column.key, column]),
) as Record<ExportColumnKey, ExportColumnDefinition>;

const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
  "full_name",
  "phone",
  "whatsapp_link",
  "email",
  "city",
  "interested_course",
  "college_name",
  "source",
  "status",
  "assigned_counsellor_name",
  "lead_score",
  "created_at",
];

type ExportColumnCategory =
  | "Identity"
  | "Contact"
  | "Academic"
  | "Pipeline"
  | "Assignment"
  | "Attribution"
  | "Activity";

const EXPORT_CATEGORY_ORDER: ExportColumnCategory[] = [
  "Identity",
  "Contact",
  "Academic",
  "Pipeline",
  "Assignment",
  "Attribution",
  "Activity",
];

const EXPORT_COLUMN_CATEGORY: Record<ExportColumnKey, ExportColumnCategory> = {
  id: "Identity",
  full_name: "Identity",
  first_name: "Identity",
  last_name: "Identity",
  phone: "Contact",
  whatsapp_link: "Contact",
  email: "Contact",
  city: "Contact",
  nationality: "Contact",
  nationality_other: "Contact",
  highest_qualification: "Academic",
  highest_qualification_other: "Academic",
  interested_course: "Academic",
  source: "Pipeline",
  status: "Pipeline",
  admission_stage: "Pipeline",
  lead_score: "Pipeline",
  follow_up_date: "Pipeline",
  not_interested_reason: "Pipeline",
  not_interested_notes: "Pipeline",
  is_duplicate: "Pipeline",
  assigned_counsellor_name: "Assignment",
  assigned_counsellor: "Assignment",
  college_name: "Assignment",
  college_id: "Assignment",
  description: "Assignment",
  campaign: "Attribution",
  utm_source: "Attribution",
  utm_medium: "Attribution",
  utm_campaign: "Attribution",
  counselling_completed_at: "Activity",
  registration_completed_at: "Activity",
  created_by: "Activity",
  created_at: "Activity",
  updated_at: "Activity",
};

const OPERATOR_OPTIONS_BY_TYPE: Record<
  ExportFieldType,
  Array<{ value: ExportOperator; label: string }>
> = {
  text: [
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does not contain" },
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not equals" },
    { value: "starts_with", label: "Starts with" },
    { value: "ends_with", label: "Ends with" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Is not empty" },
  ],
  number: [
    { value: "equals", label: "=" },
    { value: "not_equals", label: "!=" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Is not empty" },
  ],
  boolean: [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not equals" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Is not empty" },
  ],
  date: [
    { value: "equals", label: "On" },
    { value: "not_equals", label: "Not on" },
    { value: "gt", label: "After" },
    { value: "gte", label: "On or after" },
    { value: "lt", label: "Before" },
    { value: "lte", label: "On or before" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Is not empty" },
  ],
};

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function compareDateLike(rawValue: unknown, ruleValue: string) {
  const left = new Date(String(rawValue)).getTime();
  const right = new Date(ruleValue).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return {
    left,
    right,
    leftDateOnly: new Date(left).toISOString().slice(0, 10),
    rightDateOnly: new Date(right).toISOString().slice(0, 10),
    rightInputIsDateOnly: /^\d{4}-\d{2}-\d{2}$/.test(ruleValue.trim()),
  };
}

function compareNumberLike(rawValue: unknown, ruleValue: string) {
  const left = typeof rawValue === "number" ? rawValue : Number(rawValue);
  const right = Number(ruleValue);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return { left, right };
}

function matchesExportRule(lead: LeadWithRelations, rule: ExportFilterRule) {
  const definition = EXPORT_COLUMN_MAP[rule.field];
  const rawValue = definition.getRawValue(lead);
  const empty = isEmptyValue(rawValue);

  if (rule.operator === "is_empty") return empty;
  if (rule.operator === "is_not_empty") return !empty;
  if (empty) return false;

  if (definition.fieldType === "number") {
    const compared = compareNumberLike(rawValue, rule.value);
    if (!compared) return false;
    if (rule.operator === "equals") return compared.left === compared.right;
    if (rule.operator === "not_equals") return compared.left !== compared.right;
    if (rule.operator === "gt") return compared.left > compared.right;
    if (rule.operator === "gte") return compared.left >= compared.right;
    if (rule.operator === "lt") return compared.left < compared.right;
    if (rule.operator === "lte") return compared.left <= compared.right;
    return false;
  }

  if (definition.fieldType === "date") {
    const compared = compareDateLike(rawValue, rule.value);
    if (!compared) return false;
    if (rule.operator === "equals") {
      return compared.rightInputIsDateOnly
        ? compared.leftDateOnly === compared.rightDateOnly
        : compared.left === compared.right;
    }
    if (rule.operator === "not_equals") {
      return compared.rightInputIsDateOnly
        ? compared.leftDateOnly !== compared.rightDateOnly
        : compared.left !== compared.right;
    }
    if (rule.operator === "gt") return compared.left > compared.right;
    if (rule.operator === "gte") return compared.left >= compared.right;
    if (rule.operator === "lt") return compared.left < compared.right;
    if (rule.operator === "lte") return compared.left <= compared.right;
    return false;
  }

  if (definition.fieldType === "boolean") {
    const left = Boolean(rawValue);
    const right = rule.value === "true";
    if (rule.operator === "equals") return left === right;
    if (rule.operator === "not_equals") return left !== right;
    return false;
  }

  const left = String(rawValue).toLowerCase();
  const right = rule.value.toLowerCase();
  if (rule.operator === "contains") return left.includes(right);
  if (rule.operator === "not_contains") return !left.includes(right);
  if (rule.operator === "equals") return left === right;
  if (rule.operator === "not_equals") return left !== right;
  if (rule.operator === "starts_with") return left.startsWith(right);
  if (rule.operator === "ends_with") return left.endsWith(right);
  return false;
}

function csvCell(rawValue: string | number | boolean | null) {
  if (rawValue === null || rawValue === undefined) return "";
  const value = String(rawValue);
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function LeadsPageClient({
  canDelete,
  currentUserId,
  isSuperAdmin,
}: {
  canDelete: boolean;
  currentUserId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [filters, setFilters] = React.useState<LeadFilters>({
    status: "all",
    source: "all",
    collegeId: "all",
    course: "all",
  });
  // Default to the logged-in user's own leads; multi-selectable.
  const [counsellorIds, setCounsellorIds] = React.useState<string[]>([currentUserId]);
  const [counsellorPopoverOpen, setCounsellorPopoverOpen] = React.useState(false);
  const [coursePopoverOpen, setCoursePopoverOpen] = React.useState(false);
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
  const [exportDialogOpen, setExportDialogOpen] = React.useState(false);
  const [exportColumns, setExportColumns] =
    React.useState<ExportColumnKey[]>(DEFAULT_EXPORT_COLUMNS);
  const [exportMatchMode, setExportMatchMode] = React.useState<ExportMatchMode>("all");
  const [exportRules, setExportRules] = React.useState<ExportFilterRule[]>([]);
  const [exportColumnSearch, setExportColumnSearch] = React.useState("");
  const [exportTab, setExportTab] = React.useState<"columns" | "filters">("columns");
  // Single query — always fetch all statuses, filter client-side.
  // This halves network round-trips: status tab clicks are now instant.
  const {
    data: allLeads,
    isLoading,
    isFetching,
    refetch,
  } = useLeads({ ...filters, counsellorIds, status: "all", search: debouncedSearch });
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

  const allCourses = React.useMemo(() => {
    const collegeList = colleges ?? [];
    const source =
      filters.collegeId && filters.collegeId !== "all"
        ? collegeList.filter((c) => c.id === filters.collegeId)
        : collegeList;
    const set = new Set<string>();
    source.forEach((c) => c.courses.forEach((course) => set.add(course)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [colleges, filters.collegeId]);

  // Expert search applied first (without status), so both the table and the
  // status-tab counts reflect the same expert-filtered set.
  const expertFilteredLeads = React.useMemo(() => {
    const currentLeads = allLeads ?? [];
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
        lead.description ?? "",
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
  }, [allLeads, expertSearch]);

  // Status filter is applied client-side since we always fetch all statuses.
  const filteredLeads = React.useMemo(() => {
    if (!filters.status || filters.status === "all") return expertFilteredLeads;
    return expertFilteredLeads.filter((lead) => lead.status === filters.status);
  }, [expertFilteredLeads, filters.status]);

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
    expertFilteredLeads.forEach((lead) => {
      if (lead.status in counts) {
        counts[lead.status] += 1;
      }
    });
    return counts;
  }, [expertFilteredLeads]);
  const totalLeadCount = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
  const exportReadyLeads = React.useMemo(() => {
    if (!exportRules.length) return sortedLeads;
    return sortedLeads.filter((lead) => {
      const ruleMatches = exportRules.map((rule) => matchesExportRule(lead, rule));
      return exportMatchMode === "all" ? ruleMatches.every(Boolean) : ruleMatches.some(Boolean);
    });
  }, [exportMatchMode, exportRules, sortedLeads]);
  const exportColumnGroups = React.useMemo(() => {
    const term = exportColumnSearch.trim().toLowerCase();
    return EXPORT_CATEGORY_ORDER.map((category) => ({
      category,
      columns: EXPORT_COLUMN_DEFINITIONS.filter(
        (column) =>
          EXPORT_COLUMN_CATEGORY[column.key] === category &&
          (!term || column.label.toLowerCase().includes(term)),
      ),
    })).filter((group) => group.columns.length > 0);
  }, [exportColumnSearch]);
  const totalExportColumns = EXPORT_COLUMN_DEFINITIONS.length;

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

  // The default counsellor selection is the logged-in user's own leads.
  const isDefaultCounsellorSelection =
    counsellorIds.length === 1 && counsellorIds[0] === currentUserId;

  const isFiltersActive =
    !!search ||
    (filters.status && filters.status !== "all") ||
    (filters.source && filters.source !== "all") ||
    (filters.collegeId && filters.collegeId !== "all") ||
    (filters.course && filters.course !== "all") ||
    !isDefaultCounsellorSelection ||
    sortKey !== "created_at" ||
    sortDir !== "desc" ||
    Object.values(expertSearch).some((v) => (typeof v === "boolean" ? v : v !== ""));

  const resetAllFilters = () => {
    setFilters({ status: "all", source: "all", collegeId: "all", course: "all" });
    setCounsellorIds([currentUserId]);
    setSearch("");
    setDebouncedSearch("");
    setSortKey("created_at");
    setSortDir("desc");
    setExpertSearch(defaultExpertSearch);
    setExpertSearchOpen(false);
  };

  const toggleExportColumn = (columnKey: ExportColumnKey, checked: boolean) => {
    setExportColumns((prev) => {
      if (checked) {
        if (prev.includes(columnKey)) return prev;
        return [...prev, columnKey];
      }
      return prev.filter((key) => key !== columnKey);
    });
  };

  const selectAllExportColumns = () =>
    setExportColumns(EXPORT_COLUMN_DEFINITIONS.map((column) => column.key));
  const clearExportColumns = () => setExportColumns([]);
  const resetExportColumns = () => setExportColumns(DEFAULT_EXPORT_COLUMNS);
  const toggleExportCategory = (
    columns: ExportColumnDefinition[],
    select: boolean,
  ) => {
    const keys = columns.map((column) => column.key);
    setExportColumns((prev) =>
      select
        ? Array.from(new Set([...prev, ...keys]))
        : prev.filter((key) => !keys.includes(key)),
    );
  };

  const addExportRule = () => {
    setExportRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        field: "full_name",
        operator: "contains",
        value: "",
      },
    ]);
  };

  const removeExportRule = (ruleId: string) => {
    setExportRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const updateExportRule = (ruleId: string, patch: Partial<ExportFilterRule>) => {
    setExportRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const next = { ...rule, ...patch };
        const fieldType = EXPORT_COLUMN_MAP[next.field].fieldType;
        const allowedOperators = OPERATOR_OPTIONS_BY_TYPE[fieldType].map((option) => option.value);
        if (!allowedOperators.includes(next.operator)) {
          next.operator = allowedOperators[0];
          next.value = "";
        }
        if (
          EXPORT_COLUMN_MAP[next.field].fieldType === "boolean" &&
          next.operator !== "is_empty" &&
          next.operator !== "is_not_empty" &&
          next.value !== "true" &&
          next.value !== "false"
        ) {
          next.value = "true";
        }
        return next;
      }),
    );
  };

  const handleExportCsv = () => {
    if (!exportColumns.length) {
      toast.error("Select at least one column to export.");
      return;
    }
    if (!exportReadyLeads.length) {
      toast.error("No leads match the export filters.");
      return;
    }

    const header = exportColumns.map((columnKey) => csvCell(EXPORT_COLUMN_MAP[columnKey].label));
    const rows = exportReadyLeads.map((lead) =>
      exportColumns.map((columnKey) => {
        const rawValue = EXPORT_COLUMN_MAP[columnKey].getRawValue(lead);
        return csvCell(rawValue);
      }),
    );
    const csvContent = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const timestamp = format(new Date(), "yyyyMMdd-HHmmss");
    anchor.href = url;
    anchor.download = `leads-export-${timestamp}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportDialogOpen(false);
    toast.success(`Exported ${exportReadyLeads.length} leads.`);
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
          {isSuperAdmin ? (
            <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Advanced export
            </Button>
          ) : null}
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
              onValueChange={(v) => {
                const selectedCollege = (colleges ?? []).find((c) => c.id === v);
                setFilters((f) => {
                  const courseStillValid =
                    !f.course ||
                    f.course === "all" ||
                    v === "all" ||
                    (selectedCollege?.courses ?? []).includes(f.course);
                  return {
                    ...f,
                    collegeId: v,
                    course: courseStillValid ? f.course : "all",
                  };
                });
              }}
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
            <Popover open={counsellorPopoverOpen} onOpenChange={setCounsellorPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={counsellorPopoverOpen}
                  className="lg:col-span-2 w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {counsellorIds.length === 0
                      ? "All counsellors"
                      : counsellorIds.length === 1
                        ? (counsellorIds[0] === UNASSIGNED_COUNSELLOR
                            ? "Unassigned"
                            : counsellors.find((p) => p.id === counsellorIds[0])?.full_name ||
                              counsellors.find((p) => p.id === counsellorIds[0])?.email ||
                              "1 selected")
                        : `${counsellorIds.length} selected`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search counsellors…" />
                  <CommandList>
                    <CommandEmpty>No counsellors found.</CommandEmpty>
                    <CommandGroup>
                      {/* Select all / Deselect all toggle */}
                      <CommandItem
                        value="__all__"
                        onSelect={() => {
                          const hasUnassigned =
                            counsellorIds.includes(UNASSIGNED_COUNSELLOR);
                          const realSelectedCount = counsellorIds.filter(
                            (id) => id !== UNASSIGNED_COUNSELLOR,
                          ).length;
                          const allRealSelected =
                            realSelectedCount === counsellors.length;
                          if (allRealSelected) {
                            // Deselect all counsellors, keep Unassigned if it was on.
                            setCounsellorIds(hasUnassigned ? [UNASSIGNED_COUNSELLOR] : []);
                          } else {
                            const allIds = counsellors.map((p) => p.id);
                            setCounsellorIds(
                              hasUnassigned ? [...allIds, UNASSIGNED_COUNSELLOR] : allIds,
                            );
                          }
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            (() => {
                              const hasUnassigned =
                                counsellorIds.includes(UNASSIGNED_COUNSELLOR);
                              const realSelectedCount = counsellorIds.filter(
                                (id) => id !== UNASSIGNED_COUNSELLOR,
                              ).length;
                              return (realSelectedCount === 0 && !hasUnassigned) ||
                                realSelectedCount === counsellors.length
                                ? "opacity-100"
                                : "opacity-0";
                            })(),
                          )}
                        />
                        All counsellors
                      </CommandItem>
                      <CommandItem
                        value="Unassigned"
                        onSelect={() =>
                          setCounsellorIds((prev) =>
                            prev.includes(UNASSIGNED_COUNSELLOR)
                              ? prev.filter((id) => id !== UNASSIGNED_COUNSELLOR)
                              : [...prev, UNASSIGNED_COUNSELLOR],
                          )
                        }
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            counsellorIds.includes(UNASSIGNED_COUNSELLOR)
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        Unassigned
                      </CommandItem>
                      {counsellors.map((p) => {
                        const selected = counsellorIds.includes(p.id);
                        return (
                          <CommandItem
                            key={p.id}
                            value={p.full_name || p.email}
                            onSelect={() =>
                              setCounsellorIds((prev) =>
                                selected
                                  ? prev.filter((id) => id !== p.id)
                                  : [...prev, p.id],
                              )
                            }
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {p.full_name || p.email}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Popover open={coursePopoverOpen} onOpenChange={setCoursePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={coursePopoverOpen}
                  className="lg:col-span-2 w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {filters.course && filters.course !== "all"
                      ? filters.course
                      : "All courses"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search courses…" />
                  <CommandList>
                    <CommandEmpty>No courses found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__all_courses__"
                        onSelect={() => {
                          setFilters((f) => ({ ...f, course: "all" }));
                          setCoursePopoverOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            !filters.course || filters.course === "all"
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        All courses
                      </CommandItem>
                      {allCourses.map((course) => (
                        <CommandItem
                          key={course}
                          value={course}
                          onSelect={() => {
                            setFilters((f) => ({
                              ...f,
                              course: f.course === course ? "all" : course,
                            }));
                            setCoursePopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              filters.course === course ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {course}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              variant={expertSearchOpen ? "default" : "outline"}
              className="lg:col-span-1"
              onClick={() => setExpertSearchOpen((open) => !open)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Expert
            </Button>
            {isFiltersActive ? (
              <Button
                variant="ghost"
                className="lg:col-span-1 text-muted-foreground hover:text-foreground"
                onClick={resetAllFilters}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            ) : null}
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
              <TableHead className="text-right">Followups</TableHead>
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
              sortedLeads.map((lead) => {
                const followUps = getFollowUpCounts(lead);
                return (
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
                    <div className="flex items-center gap-2 font-medium">
                      {lead.full_name}
                      {lead.is_duplicate ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Duplicate
                        </Badge>
                      ) : null}
                      {lead.description ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <StickyNote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent
                              side="right"
                              className="max-w-[280px] whitespace-pre-wrap text-left"
                            >
                              {lead.description}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <WhatsAppPhoneLink phone={lead.phone} />
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
                    {followUps.total > 0 ? (
                      <Badge
                        variant={
                          followUps.completed >= followUps.total ? "default" : "secondary"
                        }
                      >
                        {followUps.completed}/{followUps.total}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
                );
              })
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

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden overflow-y-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="space-y-1 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              Export leads
            </DialogTitle>
            <DialogDescription>
              Choose the columns and rules for your CSV. Export rules apply on top of the
              filters already active on the Leads page.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={exportTab}
            onValueChange={(value) => setExportTab(value as "columns" | "filters")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="px-6 pt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="columns" className="gap-2">
                  <ListChecks className="h-3.5 w-3.5" />
                  Columns
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1.5 text-[11px]">
                    {exportColumns.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="filters" className="gap-2">
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {exportRules.length > 0 ? (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1.5 text-[11px]">
                      {exportRules.length}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="columns"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <div className="flex items-center gap-2 px-6 py-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={exportColumnSearch}
                    onChange={(event) => setExportColumnSearch(event.target.value)}
                    placeholder="Search columns…"
                    className="h-9 pl-8"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={selectAllExportColumns}>
                  Select all
                </Button>
                <Button size="sm" variant="outline" onClick={resetExportColumns}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Reset
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearExportColumns}
                  disabled={exportColumns.length === 0}
                >
                  Clear
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6">
                <div className="space-y-5 pb-4">
                  {exportColumnGroups.map((group) => {
                    const selectedCount = group.columns.filter((column) =>
                      exportColumns.includes(column.key),
                    ).length;
                    const allSelected = selectedCount === group.columns.length;
                    return (
                      <div key={group.category}>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {group.category}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {selectedCount}/{group.columns.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:underline"
                            onClick={() => toggleExportCategory(group.columns, !allSelected)}
                          >
                            {allSelected ? "Clear" : "Select all"}
                          </button>
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {group.columns.map((column) => {
                            const checked = exportColumns.includes(column.key);
                            return (
                              <label
                                key={column.key}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors",
                                  checked
                                    ? "border-primary/40 bg-primary/5"
                                    : "border-transparent hover:bg-muted/60",
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) =>
                                    toggleExportColumn(column.key, Boolean(value))
                                  }
                                />
                                <span className="truncate">{column.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {exportColumnGroups.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No columns match “{exportColumnSearch}”.
                    </p>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="filters"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
                <p className="text-xs text-muted-foreground">
                  Narrow the export with one or more field rules.
                </p>
                <div className="flex items-center gap-2">
                  <Select
                    value={exportMatchMode}
                    onValueChange={(value) => setExportMatchMode(value as ExportMatchMode)}
                  >
                    <SelectTrigger className="h-8 w-[170px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Match all rules (AND)</SelectItem>
                      <SelectItem value="any">Match any rule (OR)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={addExportRule}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add rule
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6">
                <div className="pb-4">
                  {exportRules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                      <Filter className="mb-2 h-6 w-6 text-muted-foreground/60" />
                      <p className="text-sm font-medium">No export rules yet</p>
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                        Without rules, the export uses the current Leads page filters. Add a rule
                        to refine it further.
                      </p>
                      <Button size="sm" variant="outline" className="mt-3" onClick={addExportRule}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add your first rule
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {exportRules.map((rule, index) => {
                        const fieldDefinition = EXPORT_COLUMN_MAP[rule.field];
                        const operatorOptions =
                          OPERATOR_OPTIONS_BY_TYPE[fieldDefinition.fieldType];
                        const requiresValue =
                          rule.operator !== "is_empty" && rule.operator !== "is_not_empty";
                        return (
                          <div
                            key={rule.id}
                            className="grid items-center gap-2 rounded-md border bg-muted/30 p-2 md:grid-cols-[auto_1.6fr_1fr_1fr_auto]"
                          >
                            <span className="hidden w-12 text-center text-[11px] font-medium uppercase text-muted-foreground md:block">
                              {index === 0 ? "Where" : exportMatchMode === "all" ? "And" : "Or"}
                            </span>
                            <Select
                              value={rule.field}
                              onValueChange={(value) =>
                                updateExportRule(rule.id, {
                                  field: value as ExportColumnKey,
                                })
                              }
                            >
                              <SelectTrigger className="bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPORT_COLUMN_DEFINITIONS.map((column) => (
                                  <SelectItem key={column.key} value={column.key}>
                                    {column.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Select
                              value={rule.operator}
                              onValueChange={(value) =>
                                updateExportRule(rule.id, {
                                  operator: value as ExportOperator,
                                })
                              }
                            >
                              <SelectTrigger className="bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {operatorOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {requiresValue ? (
                              fieldDefinition.fieldType === "boolean" ? (
                                <Select
                                  value={rule.value || "true"}
                                  onValueChange={(value) =>
                                    updateExportRule(rule.id, {
                                      value,
                                    })
                                  }
                                >
                                  <SelectTrigger className="bg-background">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="true">True</SelectItem>
                                    <SelectItem value="false">False</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  className="bg-background"
                                  type={
                                    fieldDefinition.fieldType === "number"
                                      ? "number"
                                      : fieldDefinition.fieldType === "date"
                                        ? "date"
                                        : "text"
                                  }
                                  placeholder={
                                    fieldDefinition.fieldType === "date"
                                      ? "YYYY-MM-DD or ISO date"
                                      : "Value"
                                  }
                                  value={rule.value}
                                  onChange={(event) =>
                                    updateExportRule(rule.id, {
                                      value: event.target.value,
                                    })
                                  }
                                />
                              )
                            ) : (
                              <div className="flex items-center rounded-md border bg-background px-3 text-sm text-muted-foreground">
                                No value needed
                              </div>
                            )}

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              onClick={() => removeExportRule(rule.id)}
                              aria-label="Remove rule"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex items-center justify-between border-t px-6 py-4 sm:justify-between">
            <div className="text-sm">
              <span className="font-semibold text-foreground">
                {exportReadyLeads.length.toLocaleString()}
              </span>
              <span className="text-muted-foreground">
                {" "}
                {exportReadyLeads.length === 1 ? "lead" : "leads"} ×{" "}
              </span>
              <span className="font-semibold text-foreground">{exportColumns.length}</span>
              <span className="text-muted-foreground">
                {" "}
                of {totalExportColumns} columns
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleExportCsv}
                disabled={exportColumns.length === 0 || exportReadyLeads.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
