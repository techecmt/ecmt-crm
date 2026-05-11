"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeads, type LeadWithRelations } from "@/lib/hooks/use-leads";
import { createClient } from "@/lib/supabase/client";
import {
  ADMISSION_STAGE_LABELS,
  type AdmissionStage,
} from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const STAGES: AdmissionStage[] = [
  "inquiry_received",
  "contacted",
  "counselling_done",
  "registration_submitted",
  "reg_fees_paid",
];

function useUpdateLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      stage,
    }: {
      id: string;
      stage: AdmissionStage;
    }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("leads")
        .update({ admission_stage: stage })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Stage updated");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function AdmissionsPageClient() {
  const { data, isLoading } = useLeads();
  const update = useUpdateLeadStage();

  const inPipeline = (data ?? []).filter(
    (l) =>
      l.status === "contacted_info_shared" ||
      l.status === "need_time_follow_up" ||
      l.status === "refer_to_management" ||
      l.status === "course_not_started" ||
      l.status === "on_discussions" ||
      l.status === "registered_closed" ||
      l.status === "registered_paid_reg_fee" ||
      l.status === "registered_dropped_out" ||
      l.admission_stage,
  );

  const grouped = STAGES.reduce<Record<AdmissionStage, LeadWithRelations[]>>(
    (acc, stage) => {
      acc[stage] = inPipeline.filter(
        (l) => (l.admission_stage ?? "inquiry_received") === stage,
      );
      return acc;
    },
    {} as Record<AdmissionStage, LeadWithRelations[]>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admissions pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Track each student through inquiry to fees paid.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {STAGES.map((s) => (
            <Skeleton key={s} className="h-72 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {STAGES.map((stage) => (
            <Card key={stage} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  {ADMISSION_STAGE_LABELS[stage]}
                  <Badge variant="secondary">{grouped[stage].length}</Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  {STAGES.indexOf(stage) === STAGES.length - 1
                    ? "Final stage"
                    : `Move to ${ADMISSION_STAGE_LABELS[STAGES[STAGES.indexOf(stage) + 1]]}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                {grouped[stage].length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    Empty
                  </div>
                ) : (
                  grouped[stage].map((lead) => (
                    <div
                      key={lead.id}
                      className="rounded-md border bg-background p-3 text-sm shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{lead.full_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {lead.college?.name ?? "No college"}
                          </div>
                        </div>
                        <Button asChild variant="ghost" size="icon">
                          <Link href={`/dashboard/leads/${lead.id}`}>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                      <Select
                        value={lead.admission_stage ?? stage}
                        onValueChange={(v) =>
                          update.mutate({
                            id: lead.id,
                            stage: v as AdmissionStage,
                          })
                        }
                      >
                        <SelectTrigger className="mt-2 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {ADMISSION_STAGE_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
