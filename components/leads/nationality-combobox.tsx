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
import { NATIONALITY_OPTIONS } from "@/lib/nationalities";
import { cn } from "@/lib/utils";

type NationalityComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** When true, selecting the active value clears it (for optional fields). */
  allowClear?: boolean;
};

export function NationalityCombobox({
  value,
  onChange,
  placeholder = "Select nationality",
  disabled,
  allowClear = false,
}: NationalityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const options = React.useMemo(() => {
    const trimmed = value.trim();
    if (trimmed && !NATIONALITY_OPTIONS.includes(trimmed as (typeof NATIONALITY_OPTIONS)[number])) {
      return [trimmed, ...NATIONALITY_OPTIONS];
    }
    return [...NATIONALITY_OPTIONS];
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search nationality…" />
          <CommandList>
            <CommandEmpty>No nationality found.</CommandEmpty>
            <CommandGroup>
              {options.map((nationality) => (
                <CommandItem
                  key={nationality}
                  value={nationality}
                  onSelect={() => {
                    if (allowClear && nationality === value) {
                      onChange("");
                    } else {
                      onChange(nationality);
                    }
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === nationality ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {nationality}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
