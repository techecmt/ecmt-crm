"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FollowUpWithRelations } from "@/lib/hooks/use-follow-ups";

export type CompleteFollowUpValues = {
  id: string;
  remarks: string;
};

const schema = z.object({
  remarks: z.string().trim().min(1, "Completion notes are required"),
});

type FormValues = z.infer<typeof schema>;

export function CompleteFollowUpDialog({
  task,
  open,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  task: FollowUpWithRelations | null;
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CompleteFollowUpValues) => Promise<void>;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      remarks: "",
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ remarks: "" });
    }
  }, [form, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete follow-up</DialogTitle>
          <DialogDescription>Add completion notes.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) =>
              onSubmit({
                id: task?.id ?? "",
                remarks: values.remarks,
              }),
            )}
          >
            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Completion notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="What happened on this follow-up?"
                      {...field}
                    />
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
              <Button type="submit" disabled={isSaving || !task}>
                {isSaving ? "Completing…" : "Complete follow-up"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
