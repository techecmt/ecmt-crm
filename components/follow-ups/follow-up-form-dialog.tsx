"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useUpsertFollowUp,
  type FollowUpWithRelations,
} from "@/lib/hooks/use-follow-ups";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import {
  FOLLOW_UP_PRIORITY_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  type FollowUpPriority,
  type FollowUpType,
  type FollowUp,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const types = Object.keys(FOLLOW_UP_TYPE_LABELS) as FollowUpType[];
const priorities = Object.keys(FOLLOW_UP_PRIORITY_LABELS) as FollowUpPriority[];

const schema = z.object({
  date: z.date({ required_error: "Pick a date" }),
  time: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM"),
  type: z.enum(types as [FollowUpType, ...FollowUpType[]]),
  priority: z.enum(priorities as [FollowUpPriority, ...FollowUpPriority[]]),
  assigned_to: z.string().optional().or(z.literal("")),
  remarks: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export function FollowUpFormDialog({
  open,
  onOpenChange,
  leadId,
  followUp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  followUp: FollowUp | FollowUpWithRelations | null;
}) {
  const upsert = useUpsertFollowUp();
  const { data: profiles } = useProfiles();
  const { data: currentProfile } = useCurrentProfile();

  const defaults = React.useMemo<FormValues>(() => {
    const initial = followUp ? new Date(followUp.scheduled_at) : new Date();
    return {
      date: initial,
      time: format(initial, "HH:mm"),
      type: (followUp?.followup_type as FollowUpType) ?? (followUp?.type as FollowUpType) ?? "call",
      priority: (followUp?.priority as FollowUpPriority) ?? "normal",
      // New follow-ups default to the logged-in user; editing keeps the saved value.
      assigned_to:
        followUp?.assigned_user_id ??
        followUp?.assigned_to ??
        (followUp ? "" : currentProfile?.id ?? ""),
      remarks: followUp?.remarks ?? followUp?.notes ?? "",
    };
  }, [followUp, currentProfile?.id]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  React.useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  const onSubmit = async (values: FormValues) => {
    await upsert.mutateAsync({
      id: followUp?.id,
      lead_id: leadId,
      followup_type: values.type,
      assigned_user_id: values.assigned_to || null,
      due_date: format(values.date, "yyyy-MM-dd"),
      due_time: values.time,
      priority: values.priority,
      remarks: values.remarks || null,
    });
    onOpenChange(false);
  };

  const counsellors = (profiles ?? []).filter((p) => p.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{followUp ? "Edit follow-up" : "Schedule follow-up"}</DialogTitle>
          <DialogDescription>
            Choose date, time and assignee.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value
                              ? format(field.value, "PP")
                              : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(d) => d && field.onChange(d)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="time"
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
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {types.map((t) => (
                          <SelectItem key={t} value={t}>
                            {FOLLOW_UP_TYPE_LABELS[t]}
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
                name="assigned_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned to</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a user" />
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
                name="priority"
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
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? "Saving…" : followUp ? "Save changes" : "Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
