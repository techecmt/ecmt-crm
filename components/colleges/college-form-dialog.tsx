"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpsertCollege } from "@/lib/hooks/use-colleges";
import type { College } from "@/lib/types";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  contact_email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  contact_phone: z.string().optional().or(z.literal("")),
  website: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  courses: z.string().optional().or(z.literal("")),
  admission_capacity: z.coerce.number().int().nonnegative().optional(),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

export function CollegeFormDialog({
  open,
  onOpenChange,
  college,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  college: College | null;
}) {
  const upsert = useUpsertCollege();

  const defaults = React.useMemo<FormValues>(
    () => ({
      name: college?.name ?? "",
      code: college?.code ?? "",
      city: college?.city ?? "",
      state: college?.state ?? "",
      address: college?.address ?? "",
      contact_email: college?.contact_email ?? "",
      contact_phone: college?.contact_phone ?? "",
      website: college?.website ?? "",
      courses: college?.courses?.join(", ") ?? "",
      admission_capacity: college?.admission_capacity ?? undefined,
      is_active: college?.is_active ?? true,
    }),
    [college],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  React.useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  const onSubmit = async (values: FormValues) => {
    const courses = (values.courses ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await upsert.mutateAsync({
      id: college?.id,
      name: values.name,
      code: values.code || null,
      city: values.city || null,
      state: values.state || null,
      address: values.address || null,
      contact_email: values.contact_email || null,
      contact_phone: values.contact_phone || null,
      website: values.website || null,
      courses,
      admission_capacity:
        values.admission_capacity != null && !Number.isNaN(values.admission_capacity)
          ? Number(values.admission_capacity)
          : null,
      is_active: values.is_active,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{college ? "Edit college" : "Add college"}</DialogTitle>
          <DialogDescription>
            College profile, courses and admission capacity. Country is fixed to Singapore.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="ABC Institute of Technology" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input placeholder="ABCIT" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="admission_capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Admission capacity</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder="500"
                      {...field}
                      value={field.value ?? ""}
                    />
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
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact phone</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input placeholder="https://" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="courses"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Courses</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="B.Tech CSE, BBA, MBA …"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Comma-separated list.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      Inactive colleges are hidden from lead assignment.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? "Saving…" : college ? "Save changes" : "Create college"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
