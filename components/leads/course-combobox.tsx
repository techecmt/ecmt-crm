"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CourseComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  courses: string[];
  placeholder?: string;
  disabled?: boolean;
  /** When true, selecting the active value clears it (for optional fields). */
  allowClear?: boolean;
};

export function CourseCombobox({
  value,
  onChange,
  courses,
  placeholder = "Select course",
  disabled,
  allowClear = false,
}: CourseComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const options = React.useMemo(() => {
    const trimmed = value.trim();
    if (trimmed && !courses.includes(trimmed)) {
      return [trimmed, ...courses];
    }
    return courses;
  }, [courses, value]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search course…" />
          <CommandList>
            <CommandEmpty>No course found.</CommandEmpty>
            <CommandGroup>
              {options.map((course) => (
                <CommandItem
                  key={course}
                  value={course}
                  onSelect={() => {
                    if (allowClear && course === value) {
                      onChange("");
                    } else {
                      onChange(course);
                    }
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === course ? "opacity-100" : "opacity-0",
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
  );
}
