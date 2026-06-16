"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CourseCombobox } from "@/components/leads/course-combobox";
import { NationalityCombobox } from "@/components/leads/nationality-combobox";
import {
  useCompleteCounselling,
  useMarkNotInterested,
  useUpdateLeadStatus,
  type LeadWithRelations,
} from "@/lib/hooks/use-leads";
import { useColleges } from "@/lib/hooks/use-colleges";
import { useFollowUps } from "@/lib/hooks/use-follow-ups";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { NATIONALITY_OPTIONS, nationalityFormDefaults } from "@/lib/nationalities";
import {
  evaluateLeadTransition,
  type LeadTransitionContext,
} from "@/lib/lead-pipeline";
import {
  COUNSELLING_CHECK_KEYS,
  COUNSELLING_CHECK_LABELS,
  COUNSELLING_STATUSES,
  HIGHEST_QUALIFICATION_LABELS,
  LEAD_STATUS_LABELS,
  NOT_INTERESTED_REASON_LABELS,
  type CounsellingCheckKey,
  type HighestQualification,
  type Lead,
  type LeadStatus,
  type NotInterestedReason,
} from "@/lib/types";

const qualifications = Object.keys(HIGHEST_QUALIFICATION_LABELS) as HighestQualification[];
const reasons = Object.keys(NOT_INTERESTED_REASON_LABELS) as NotInterestedReason[];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | LeadWithRelations | null;
  nextStatus: LeadStatus | null;
};

export function StatusWorkflowDialog({ open, onOpenChange, lead, nextStatus }: Props) {
  if (!lead || !nextStatus) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <InnerWorkflow
          lead={lead}
          nextStatus={nextStatus}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function InnerWorkflow({
  lead,
  nextStatus,
  onDone,
}: {
  lead: Lead | LeadWithRelations;
  nextStatus: LeadStatus;
  onDone: () => void;
}) {
  const { data: followUps } = useFollowUps({ leadId: lead.id, assignedTo: undefined });

  const completedCounsellingFollowUps = React.useMemo(
    () =>
      (followUps ?? []).filter(
        (f) => f.status === "completed" && f.sequence != null,
      ).length,
    [followUps],
  );

  const hasEnteredCounselling = React.useMemo(() => {
    if (COUNSELLING_STATUSES.includes(lead.status)) return true;
    if (lead.counselling_completed_at) return true;
    return (followUps ?? []).some((f) => f.sequence != null);
  }, [followUps, lead]);

  const hasCompletedCounselling =
    lead.status === "counselling_completed" || !!lead.counselling_completed_at;

  const ctx: LeadTransitionContext = {
    currentStatus: lead.status,
    hasEnteredCounselling,
    hasCompletedCounselling,
    completedCounsellingFollowUps,
  };

  const evaluation = evaluateLeadTransition(nextStatus, ctx);

  if (!evaluation.allowed) {
    return (
      <BlockedTransition reason={evaluation.reason} next={nextStatus} onClose={onDone} />
    );
  }

  if (nextStatus === "counselling_completed") {
    return <CounsellingCompletedForm lead={lead} onDone={onDone} />;
  }

  if (nextStatus === "not_interested") {
    return <NotInterestedForm lead={lead} onDone={onDone} />;
  }
  if (nextStatus === "course_not_started") {
    return <InactiveCoursesForm lead={lead} onDone={onDone} />;
  }

  if (nextStatus === "registration_unpaid" || nextStatus === "registered_paid_reg_fee") {
    return <RegistrationForm lead={lead} nextStatus={nextStatus} onDone={onDone} />;
  }

  return <SimpleStatusConfirm lead={lead} nextStatus={nextStatus} onDone={onDone} />;
}

function BlockedTransition({
  reason,
  next,
  onClose,
}: {
  reason?: string;
  next: LeadStatus;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Status change not allowed</DialogTitle>
        <DialogDescription>
          Moving to{" "}
          <span className="inline-flex items-center rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {LEAD_STATUS_LABELS[next]}
          </span>{" "}
          is blocked by the counselling pipeline rules.
        </DialogDescription>
      </DialogHeader>
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Pipeline rule</AlertTitle>
        <AlertDescription>{reason ?? "Transition is not allowed."}</AlertDescription>
      </Alert>
      <DialogFooter>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}

function SimpleStatusConfirm({
  lead,
  nextStatus,
  onDone,
}: {
  lead: Lead | LeadWithRelations;
  nextStatus: LeadStatus;
  onDone: () => void;
}) {
  const updateStatus = useUpdateLeadStatus();
  const { data: profiles } = useProfiles();
  const isCounsellingInProgress = nextStatus === "counselling_in_progress";
  const [counsellorId, setCounsellorId] = React.useState(
    lead.assigned_counsellor ?? "",
  );
  const [counsellorError, setCounsellorError] = React.useState("");

  React.useEffect(() => {
    setCounsellorId(lead.assigned_counsellor ?? "");
    setCounsellorError("");
  }, [lead.assigned_counsellor, nextStatus]);

  const counsellors = (profiles ?? []).filter(
    (p) =>
      p.is_active &&
      ["counsellor", "admission_manager", "management", "super_admin"].includes(
        p.role,
      ),
  );

  const handleConfirm = async () => {
    if (isCounsellingInProgress && !counsellorId) {
      setCounsellorError("Assign a counsellor before starting counselling.");
      return;
    }
    await updateStatus.mutateAsync({
      id: lead.id,
      status: nextStatus,
      assigned_user_id: isCounsellingInProgress ? counsellorId : undefined,
    });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Move to {LEAD_STATUS_LABELS[nextStatus]}
        </DialogTitle>
        <DialogDescription>
          Current status:{" "}
          <span className="inline-flex items-center rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {LEAD_STATUS_LABELS[lead.status]}
          </span>
        </DialogDescription>
      </DialogHeader>

      {isCounsellingInProgress ? (
        <>
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Counsellor will be assigned</AlertTitle>
            <AlertDescription>
              The system will schedule 2 follow-ups now (72-hour interval).
              When counselling is completed, it will add another 2 follow-ups.
            </AlertDescription>
          </Alert>
          <div className="grid gap-2">
            <Label htmlFor="counselling-counsellor">Counsellor</Label>
            <Select
              value={counsellorId || "none"}
              onValueChange={(v) => {
                setCounsellorId(v === "none" ? "" : v);
                setCounsellorError("");
              }}
            >
              <SelectTrigger id="counselling-counsellor">
                <SelectValue placeholder="Select counsellor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Select counsellor —</SelectItem>
                {counsellors.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {counsellorError ? (
              <p className="text-xs text-destructive">{counsellorError}</p>
            ) : null}
          </div>
        </>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={updateStatus.isPending}>
          {updateStatus.isPending ? "Updating…" : "Confirm change"}
        </Button>
      </DialogFooter>
    </>
  );
}

const counsellingSchema = z
  .object({
    first_name: z.string().trim().min(1, "First name is required"),
    last_name: z.string().trim().optional().or(z.literal("")),
    phone: z.string().trim().min(5, "Phone is required"),
    nationality: z.enum(
      NATIONALITY_OPTIONS as unknown as [string, ...string[]],
      { required_error: "Select a nationality" },
    ),
    nationality_other: z.string().optional().or(z.literal("")),
    highest_qualification: z.enum(
      qualifications as [HighestQualification, ...HighestQualification[]],
    ),
    highest_qualification_other: z.string().optional().or(z.literal("")),
    college_id: z.string().min(1, "Select a college"),
    interested_course: z.string().min(1, "Select a course"),
    counselling_checks: z
      .object({
        website_details: z.boolean(),
        mer: z.boolean(),
        policies: z.boolean(),
        fee_structure: z.boolean(),
        attendance: z.boolean(),
      })
      .refine((c) => Object.values(c).every(Boolean), {
        message: "All counselling checks must be confirmed",
      }),
  })
  .superRefine((v, ctx) => {
    if (v.nationality === "Other" && !v.nationality_other?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nationality_other"],
        message: "Please specify the nationality",
      });
    }
    if (v.highest_qualification === "other" && !v.highest_qualification_other?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["highest_qualification_other"],
        message: "Please specify the qualification",
      });
    }
  });

type CounsellingFormValues = z.infer<typeof counsellingSchema>;

function CounsellingCompletedForm({
  lead,
  onDone,
}: {
  lead: Lead | LeadWithRelations;
  onDone: () => void;
}) {
  const completeCounselling = useCompleteCounselling();
  const { data: colleges } = useColleges({ activeOnly: true });

  const form = useForm<CounsellingFormValues>({
    resolver: zodResolver(counsellingSchema),
    defaultValues: {
      first_name: lead.first_name ?? lead.full_name.split(" ")[0] ?? "",
      last_name:
        lead.last_name ??
        lead.full_name.split(" ").slice(1).join(" ") ??
        "",
      phone: lead.phone ?? "",
      ...nationalityFormDefaults({
        nationality: lead.nationality,
        nationality_other: lead.nationality_other,
      }),
      highest_qualification: (lead.highest_qualification ?? "o_level") as HighestQualification,
      highest_qualification_other: lead.highest_qualification_other ?? "",
      college_id: lead.college_id ?? "",
      interested_course: lead.interested_course ?? "",
      counselling_checks: {
        website_details: !!lead.counselling_checks?.website_details,
        mer: !!lead.counselling_checks?.mer,
        policies: !!lead.counselling_checks?.policies,
        fee_structure: !!lead.counselling_checks?.fee_structure,
        attendance: !!lead.counselling_checks?.attendance,
      },
    },
  });

  const selectedCollegeId = form.watch("college_id");
  const selectedCollege = (colleges ?? []).find((c) => c.id === selectedCollegeId);
  const courses = Array.from(
    new Set(
      (selectedCollege?.courses ?? [])
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  );
  const selectedQualification = form.watch("highest_qualification");
  const selectedNationality = form.watch("nationality");

  const onSubmit = async (values: CounsellingFormValues) => {
    await completeCounselling.mutateAsync({
      id: lead.id,
      first_name: values.first_name,
      last_name: values.last_name,
      phone: values.phone,
      nationality: values.nationality,
      nationality_other:
        values.nationality === "Other"
          ? values.nationality_other?.trim() || null
          : null,
      highest_qualification: values.highest_qualification,
      highest_qualification_other:
        values.highest_qualification === "other"
          ? values.highest_qualification_other || null
          : null,
      college_id: values.college_id,
      interested_course: values.interested_course,
      counselling_checks: values.counselling_checks,
    });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Complete counselling</DialogTitle>
        <DialogDescription>
          Confirm all mandatory checks and counselling fields before completing.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="mb-2 text-sm font-medium">
              Mandatory counselling checks
            </div>
            <div className="grid gap-2">
              {COUNSELLING_CHECK_KEYS.map((key) => (
                <CounsellingCheckRow key={key} name={key} form={form} />
              ))}
            </div>
            {form.formState.errors.counselling_checks?.message ? (
              <p className="mt-2 text-xs text-destructive">
                {form.formState.errors.counselling_checks.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nationality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nationality</FormLabel>
                  <FormControl>
                    <NationalityCombobox
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Select nationality"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedNationality === "Other" ? (
              <FormField
                control={form.control}
                name="nationality_other"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Specify nationality</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter nationality" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="highest_qualification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Highest qualification</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {qualifications.map((q) => (
                        <SelectItem key={q} value={q}>
                          {HIGHEST_QUALIFICATION_LABELS[q]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedQualification === "other" ? (
              <FormField
                control={form.control}
                name="highest_qualification_other"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Specify qualification</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="college_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>College</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select college" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(colleges ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="interested_course"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Counselled course</FormLabel>
                  <FormControl>
                    <CourseCombobox
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      courses={courses}
                      placeholder={
                        !selectedCollege
                          ? "Select college first"
                          : "Select course"
                      }
                      disabled={!selectedCollege || courses.length === 0}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={completeCounselling.isPending}>
              {completeCounselling.isPending
                ? "Completing…"
                : "Complete counselling"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

function CounsellingCheckRow({
  name,
  form,
}: {
  name: CounsellingCheckKey;
  form: ReturnType<typeof useForm<CounsellingFormValues>>;
}) {
  return (
    <FormField
      control={form.control}
      name={`counselling_checks.${name}` as const}
      render={({ field }) => {
        const isError = form.formState.isSubmitted && !field.value;
        return (
          <FormItem
            className={cn(
              "flex flex-row items-center justify-between rounded-md border px-3 py-2 transition-colors",
              isError
                ? "border-destructive bg-destructive/5"
                : "border-border bg-background",
            )}
          >
            <Label
              htmlFor={`check-${name}`}
              className={cn(
                "text-sm font-normal",
                isError && "text-destructive",
              )}
            >
              {COUNSELLING_CHECK_LABELS[name]}
            </Label>
            <FormControl>
              <Checkbox
                id={`check-${name}`}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        );
      }}
    />
  );
}

const notInterestedSchema = z
  .object({
    reason: z.enum(reasons as [NotInterestedReason, ...NotInterestedReason[]]),
    notes: z.string().trim().min(3, "Please describe why the lead is not interested"),
  });

type NotInterestedFormValues = z.infer<typeof notInterestedSchema>;

function NotInterestedForm({
  lead,
  onDone,
}: {
  lead: Lead | LeadWithRelations;
  onDone: () => void;
}) {
  const markNotInterested = useMarkNotInterested();

  const form = useForm<NotInterestedFormValues>({
    resolver: zodResolver(notInterestedSchema),
    defaultValues: {
      reason: lead.not_interested_reason ?? "financial_issues",
      notes: lead.not_interested_notes ?? "",
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark Not Interested</DialogTitle>
        <DialogDescription>
          Reason and notes are mandatory. Any pending follow-ups will be cleared.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(async (values) => {
            await markNotInterested.mutateAsync({
              id: lead.id,
              reason: values.reason,
              notes: values.notes,
            });
            onDone();
          })}
          className="grid gap-4"
        >
          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reason</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {reasons.map((r) => (
                      <SelectItem key={r} value={r}>
                        {NOT_INTERESTED_REASON_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder="Why is the lead not interested? Add any extra context."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={markNotInterested.isPending}>
              {markNotInterested.isPending ? "Saving…" : "Mark Not Interested"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

const registrationSchema = z.object({
  registration_completed_at: z
    .string()
    .min(1, "Registration completed date is required"),
});

type RegistrationFormValues = z.infer<typeof registrationSchema>;

function RegistrationForm({
  lead,
  nextStatus,
  onDone,
}: {
  lead: Lead | LeadWithRelations;
  nextStatus: LeadStatus;
  onDone: () => void;
}) {
  const updateStatus = useUpdateLeadStatus();
  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      registration_completed_at: lead.registration_completed_at
        ? lead.registration_completed_at.split("T")[0]
        : new Date().toISOString().split("T")[0],
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Move to {LEAD_STATUS_LABELS[nextStatus]}
        </DialogTitle>
        <DialogDescription>
          A registration completed date is required before moving to this status.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(async (values) => {
            await updateStatus.mutateAsync({
              id: lead.id,
              status: nextStatus,
              registration_completed_at: new Date(
                values.registration_completed_at,
              ).toISOString(),
            });
            onDone();
          })}
          className="grid gap-4"
        >
          <FormField
            control={form.control}
            name="registration_completed_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Registration Completed Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Updating…" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

const inactiveCoursesSchema = z.object({
  notes: z.string().trim().min(3, "Notes are required for Inactive Courses"),
});

type InactiveCoursesFormValues = z.infer<typeof inactiveCoursesSchema>;

function InactiveCoursesForm({
  lead,
  onDone,
}: {
  lead: Lead | LeadWithRelations;
  onDone: () => void;
}) {
  const updateStatus = useUpdateLeadStatus();
  const form = useForm<InactiveCoursesFormValues>({
    resolver: zodResolver(inactiveCoursesSchema),
    defaultValues: {
      notes: "",
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark Inactive Courses</DialogTitle>
        <DialogDescription>
          Notes are mandatory. Any pending follow-ups will be cleared.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(async (values) => {
            await updateStatus.mutateAsync({
              id: lead.id,
              status: "course_not_started",
              notes: values.notes,
            });
            onDone();
          })}
          className="grid gap-4"
        >
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder="Why is the lead inactive course? Add full context."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Saving…" : "Mark Inactive Courses"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
