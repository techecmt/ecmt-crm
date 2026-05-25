"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useColleges } from "@/lib/hooks/use-colleges";
import { useUpsertLead } from "@/lib/hooks/use-leads";
import { useProfiles } from "@/lib/hooks/use-profiles";
import {
  DEFAULT_LEAD_SOURCE,
  FOLLOW_UP_PRIORITY_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type FollowUpPriority,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from "@/lib/types";

const sources = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];
const statuses = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];
const priorities = Object.keys(FOLLOW_UP_PRIORITY_LABELS) as FollowUpPriority[];
const terminalStatuses = new Set<LeadStatus>([
  "invalid",
  "unable_to_reach",
  "no_response",
  "not_interested",
  "registered_closed",
  "registered_paid_reg_fee",
  "registered_dropped_out",
]);

function defaultFollowUpDate() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10);
}

function defaultFollowUpTime() {
  return "10:00";
}

const schema = z.object({
  full_name: z.string().min(2, "Name is required"),
  phone: z.string().min(5, "Phone is required"),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  interested_course: z.string().optional().or(z.literal("")),
  college_id: z.string().optional().or(z.literal("")),
  source: z.enum(sources as [LeadSource, ...LeadSource[]]),
  status: z.enum(statuses as [LeadStatus, ...LeadStatus[]]),
  assigned_counsellor: z.string().optional().or(z.literal("")),
  campaign: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  lead_score: z.coerce.number().int().min(0).max(100).default(0),
  follow_up_date: z.string().optional().or(z.literal("")),
  follow_up_time: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM").optional().or(z.literal("")),
  follow_up_priority: z.enum(priorities as [FollowUpPriority, ...FollowUpPriority[]]),
  follow_up_remarks: z.string().optional().or(z.literal("")),
}).superRefine((values, ctx) => {
  if (terminalStatuses.has(values.status)) return;
  if (!values.follow_up_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["follow_up_date"],
      message: "Next follow-up date is required for active leads",
    });
  }
  if (!values.assigned_counsellor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["assigned_counsellor"],
      message: "Assign a counsellor before scheduling follow-up work",
    });
  }
});

type FormValues = z.infer<typeof schema>;

export function LeadFormSheet({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
}) {
  const { data: colleges } = useColleges({ activeOnly: true });
  const { data: profiles } = useProfiles();
  const upsert = useUpsertLead();

  const counsellors = (profiles ?? []).filter(
    (p) =>
      p.is_active &&
      ["counsellor", "admission_manager", "management", "super_admin"].includes(p.role),
  );

  const defaults = React.useMemo<FormValues>(
    () => ({
      full_name: lead?.full_name ?? "",
      phone: lead?.phone ?? "",
      email: lead?.email ?? "",
      city: lead?.city ?? "",
      interested_course: lead?.interested_course ?? "",
      college_id: lead?.college_id ?? "",
      source: (lead?.source as LeadSource) ?? DEFAULT_LEAD_SOURCE,
      status: (lead?.status as LeadStatus) ?? "inquiry_received",
      assigned_counsellor: lead?.assigned_counsellor ?? "",
      campaign: lead?.campaign ?? "",
      notes: lead?.notes ?? "",
      lead_score: lead?.lead_score ?? 0,
      follow_up_date: lead?.follow_up_date
        ? new Date(lead.follow_up_date).toISOString().slice(0, 10)
        : defaultFollowUpDate(),
      follow_up_time: lead?.follow_up_date
        ? new Date(lead.follow_up_date).toTimeString().slice(0, 5)
        : defaultFollowUpTime(),
      follow_up_priority: lead?.lead_score && lead.lead_score >= 80 ? "high" : "normal",
      follow_up_remarks: "",
    }),
    [lead],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const selectedCollegeId = form.watch("college_id");
  const selectedStatus = form.watch("status");
  const requiresFollowUp = !terminalStatuses.has(selectedStatus);
  const selectedCollege = React.useMemo(
    () => (colleges ?? []).find((college) => college.id === selectedCollegeId),
    [colleges, selectedCollegeId],
  );
  const availableCourses = React.useMemo(
    () =>
      Array.from(
        new Set(
          (selectedCollege?.courses ?? [])
            .map((course) => course.trim())
            .filter(Boolean),
        ),
      ),
    [selectedCollege],
  );

  React.useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  React.useEffect(() => {
    if (!selectedCollege) return;
    const currentCourse = form.getValues("interested_course");
    if (!currentCourse) return;
    if (!availableCourses.includes(currentCourse)) {
      form.setValue("interested_course", "");
    }
  }, [availableCourses, form, selectedCollege]);

  const onSubmit = async (values: FormValues) => {
    await upsert.mutateAsync({
      id: lead?.id,
      full_name: values.full_name,
      phone: values.phone,
      email: values.email || null,
      city: values.city || null,
      interested_course: values.interested_course || null,
      college_id: values.college_id || null,
      source: values.source,
      status: values.status,
      assigned_counsellor: values.assigned_counsellor || null,
      campaign: values.campaign || null,
      notes: values.notes || null,
      follow_up_date:
        requiresFollowUp && values.follow_up_date
          ? new Date(`${values.follow_up_date}T${values.follow_up_time || defaultFollowUpTime()}`).toISOString()
          : null,
      lead_score: values.lead_score,
      initial_follow_up_priority: requiresFollowUp
        ? values.follow_up_priority
        : undefined,
      initial_follow_up_remarks: requiresFollowUp
        ? values.follow_up_remarks || "First follow-up for active lead"
        : null,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{lead ? "Edit lead" : "Add lead"}</SheetTitle>
          <SheetDescription>
            Capture and qualify a new student inquiry.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-6 grid gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Full name</FormLabel>
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="interested_course"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interested course</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) =>
                        field.onChange(v === "none" ? "" : v)
                      }
                      disabled={!selectedCollege || availableCourses.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !selectedCollege
                                ? "Select college first"
                                : "Select course"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {availableCourses.map((course) => (
                          <SelectItem key={course} value={course}>
                            {course}
                          </SelectItem>
                        ))}
                        {field.value &&
                        !availableCourses.includes(field.value) ? (
                          <SelectItem value={field.value}>{field.value}</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="college_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>College</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) =>
                        field.onChange(v === "none" ? "" : v)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select college" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
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
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sources.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LEAD_SOURCE_LABELS[s]}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LEAD_STATUS_LABELS[s]}
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
                name="assigned_counsellor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Counsellor</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) =>
                        field.onChange(v === "none" ? "" : v)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">— Unassigned —</SelectItem>
                        {counsellors.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.email}
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
                name="campaign"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign / UTM</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lead_score"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead score</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {requiresFollowUp ? (
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-3">
                  <div className="text-sm font-medium">Next follow-up</div>
                  <p className="text-xs text-muted-foreground">
                    Active leads must always have a pending follow-up task.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="follow_up_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="follow_up_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="follow_up_priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {priorities.map((priority) => (
                              <SelectItem key={priority} value={priority}>
                                {FOLLOW_UP_PRIORITY_LABELS[priority]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="follow_up_remarks"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>Task remarks</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Context for the first follow-up" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SheetFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? "Saving…" : lead ? "Save changes" : "Create lead"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
