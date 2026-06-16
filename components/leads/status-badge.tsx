import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";

const STATUS_STYLES: Record<LeadStatus, string> = {
  inquiry_received:
    "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/20 dark:text-blue-300",
  counselling_in_progress:
    "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/20 dark:text-rose-300",
  counselling_completed:
    "bg-indigo-100 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300",
  no_response:
    "bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-500/20 dark:text-orange-300",
  not_interested:
    "bg-zinc-200 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700/40 dark:text-zinc-300",
  invalid:
    "bg-zinc-200 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700/40 dark:text-zinc-300",
  course_not_started:
    "bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-500/20 dark:text-slate-300",
  registration_unpaid:
    "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300",
  registered_paid_reg_fee:
    "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300",
  // Legacy
  unable_to_reach:
    "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300",
  contacted_info_shared:
    "bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-500/20 dark:text-purple-300",
  need_time_follow_up:
    "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-500/20 dark:text-yellow-300",
  refer_to_management:
    "bg-indigo-100 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300",
  on_discussions:
    "bg-cyan-100 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-500/20 dark:text-cyan-300",
  registered_closed:
    "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-500/20 dark:text-green-300",
  registered_dropped_out:
    "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-500/20 dark:text-red-300",
};

export function LeadStatusBadge({
  status,
  className,
}: {
  status: LeadStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLES[status], "border-0", className)}>
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  );
}
