"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { AlertTriangle, History } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { CourseCombobox } from "@/components/leads/course-combobox";
import { NationalityCombobox } from "@/components/leads/nationality-combobox";
import { useColleges } from "@/lib/hooks/use-colleges";
import { useLeads, useUpsertLead } from "@/lib/hooks/use-leads";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { findDuplicateLeads, type DuplicateCheckLead } from "@/lib/lead-duplicates";
import { nationalityFormDefaults } from "@/lib/nationalities";
import {
  DEFAULT_LEAD_SOURCE,
  HIGHEST_QUALIFICATION_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type HighestQualification,
  type Lead,
  type LeadSource,
} from "@/lib/types";

const sources = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];
const qualifications = Object.keys(
  HIGHEST_QUALIFICATION_LABELS,
) as HighestQualification[];

const schema = z
  .object({
    first_name: z.string().trim().min(1, "First name is required"),
    last_name: z.string().optional().or(z.literal("")),
    phone: z.string().min(5, "Phone is required"),
    email: z.string().email().optional().or(z.literal("")),
    city: z.string().optional().or(z.literal("")),
    nationality: z.string().optional().or(z.literal("")),
    nationality_other: z.string().optional().or(z.literal("")),
    highest_qualification: z
      .enum(qualifications as [HighestQualification, ...HighestQualification[]])
      .optional(),
    highest_qualification_other: z.string().optional().or(z.literal("")),
    interested_course: z.string().optional().or(z.literal("")),
    college_id: z.string().optional().or(z.literal("")),
    source: z.enum(sources as [LeadSource, ...LeadSource[]]),
    assigned_counsellor: z.string().optional().or(z.literal("")),
    campaign: z.string().optional().or(z.literal("")),
    description: z.string().optional().or(z.literal("")),
    lead_score: z.coerce.number().int().min(0).max(100).default(0),
  })
  .superRefine((values, ctx) => {
    if (values.nationality === "Other" && !values.nationality_other?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nationality_other"],
        message: "Please specify the nationality",
      });
    }
    if (
      values.highest_qualification === "other" &&
      !values.highest_qualification_other?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["highest_qualification_other"],
        message: "Please specify the qualification",
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
  const { data: allLeads } = useLeads();
  const { data: currentProfile } = useCurrentProfile();
  const upsert = useUpsertLead();

  const counsellors = (profiles ?? []).filter(
    (p) =>
      p.is_active &&
      ["counsellor", "admission_manager", "management", "super_admin"].includes(p.role),
  );

  const defaults = React.useMemo<FormValues>(() => {
    const fallbackFirst = lead?.full_name?.split(" ")[0] ?? "";
    const fallbackLast = lead?.full_name?.split(" ").slice(1).join(" ") ?? "";
    const nationalityDefaults = nationalityFormDefaults({
      nationality: lead?.nationality ?? null,
      nationality_other: lead?.nationality_other ?? null,
    });
    return {
      first_name: lead?.first_name ?? fallbackFirst,
      last_name: lead?.last_name ?? fallbackLast,
      phone: lead?.phone ?? "",
      email: lead?.email ?? "",
      city: lead?.city ?? "",
      nationality: nationalityDefaults.nationality,
      nationality_other: nationalityDefaults.nationality_other,
      highest_qualification:
        (lead?.highest_qualification as HighestQualification | undefined) ??
        undefined,
      highest_qualification_other: lead?.highest_qualification_other ?? "",
      interested_course: lead?.interested_course ?? "",
      college_id: lead?.college_id ?? "",
      source: (lead?.source as LeadSource) ?? DEFAULT_LEAD_SOURCE,
      // New leads default to the logged-in user; editing keeps the saved value.
      assigned_counsellor:
        lead?.assigned_counsellor ?? (lead ? "" : currentProfile?.id ?? ""),
      campaign: lead?.campaign ?? "",
      description: lead?.description ?? "",
      lead_score: lead?.lead_score ?? 0,
    };
  }, [lead, currentProfile?.id]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const selectedCollegeId = form.watch("college_id");
  const selectedQualification = form.watch("highest_qualification");
  const selectedNationality = form.watch("nationality");
  const watchedPhone = form.watch("phone");
  const watchedCourse = form.watch("interested_course");
  const duplicateCheck = React.useMemo(
    () =>
      findDuplicateLeads(allLeads ?? [], {
        phone: watchedPhone,
        collegeId: selectedCollegeId || null,
        course: watchedCourse || null,
        excludeLeadId: lead?.id ?? null,
      }),
    [allLeads, watchedPhone, selectedCollegeId, watchedCourse, lead?.id],
  );
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
    const firstName = values.first_name.trim();
    const lastName = values.last_name?.trim() ?? "";
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    await upsert.mutateAsync({
      id: lead?.id,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName || null,
      phone: values.phone,
      email: values.email || null,
      city: values.city || null,
      nationality: values.nationality?.trim() || null,
      nationality_other:
        values.nationality === "Other"
          ? values.nationality_other?.trim() || null
          : null,
      highest_qualification: values.highest_qualification ?? null,
      highest_qualification_other:
        values.highest_qualification === "other"
          ? values.highest_qualification_other?.trim() || null
          : null,
      interested_course: values.interested_course || null,
      college_id: values.college_id || null,
      source: values.source,
      assigned_counsellor: values.assigned_counsellor || null,
      campaign: values.campaign || null,
      description: values.description || null,
      lead_score: values.lead_score,
      is_duplicate: duplicateCheck.activeMatches.length > 0,
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
                    <FormLabel>Last name (optional)</FormLabel>
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
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nationality</FormLabel>
                    <FormControl>
                      <NationalityCombobox
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="Select nationality"
                        allowClear
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
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(v) =>
                        field.onChange(v === "none" ? undefined : v)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
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
                name="interested_course"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interested course</FormLabel>
                    <FormControl>
                      <CourseCombobox
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        courses={availableCourses}
                        placeholder={
                          !selectedCollege
                            ? "Select college first"
                            : "Select course"
                        }
                        disabled={!selectedCollege || availableCourses.length === 0}
                        allowClear
                      />
                    </FormControl>
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
            {duplicateCheck.activeMatches.length > 0 ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Possible duplicate lead</AlertTitle>
                <AlertDescription>
                  An active lead already exists with this phone number
                  {selectedCollegeId || watchedCourse ? ", college and course" : ""}.
                  Saving will flag this lead as a duplicate.
                  <DuplicateMatchList matches={duplicateCheck.activeMatches} />
                </AlertDescription>
              </Alert>
            ) : null}
            {duplicateCheck.terminalMatches.length > 0 ? (
              <Alert>
                <History className="h-4 w-4" />
                <AlertTitle>Previous lead history</AlertTitle>
                <AlertDescription>
                  This person had earlier closed leads. This will be saved as a
                  normal new lead.
                  <DuplicateMatchList matches={duplicateCheck.terminalMatches} />
                </AlertDescription>
              </Alert>
            ) : null}
            {!lead ? (
              <p className="text-xs text-muted-foreground">
                New leads start at <strong>Inquiry Received</strong>. Assign a
                counsellor when moving to <strong>Counselling In-Progress</strong>{" "}
                from the status dropdown in the leads list or lead detail page.
              </p>
            ) : null}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
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

function DuplicateMatchList({ matches }: { matches: DuplicateCheckLead[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {matches.slice(0, 3).map((match) => (
        <li key={match.id} className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className="font-medium">{match.full_name}</span>
          <span>· {LEAD_STATUS_LABELS[match.status]}</span>
          <span>· {format(new Date(match.created_at), "PP")}</span>
          <Link
            href={`/dashboard/leads/${match.id}`}
            target="_blank"
            className="underline underline-offset-2"
          >
            View lead
          </Link>
        </li>
      ))}
      {matches.length > 3 ? (
        <li className="text-xs text-muted-foreground">
          +{matches.length - 3} more with the same details
        </li>
      ) : null}
    </ul>
  );
}
