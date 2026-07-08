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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectFilterProps = {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
};

function formatSelectionLabel(
  selected: string[],
  options: MultiSelectOption[],
  placeholder: string,
): string {
  if (selected.length === 0) return placeholder;
  if (selected.length === 1) {
    return options.find((option) => option.value === selected[0])?.label ?? "1 selected";
  }
  return `${selected.length} selected`;
}

export function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder = "All",
  allLabel = "Select all",
  searchPlaceholder = "Search…",
  emptyMessage = "No options found.",
  className,
  disabled = false,
}: MultiSelectFilterProps) {
  const [open, setOpen] = React.useState(false);
  const allSelected = options.length > 0 && selected.length === options.length;

  const toggleAll = () => {
    onChange(allSelected ? [] : options.map((option) => option.value));
  };

  const toggleOption = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal sm:w-[220px]", className)}
        >
          <span className="truncate">
            {formatSelectionLabel(selected, options, placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={toggleAll}>
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selected.length === 0 || allSelected ? "opacity-100" : "opacity-0",
                  )}
                />
                {allLabel}
              </CommandItem>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggleOption(option.value)}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
                    />
                    {option.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
