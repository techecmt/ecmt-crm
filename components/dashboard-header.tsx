"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import type { Profile } from "@/lib/types";

export function DashboardHeader({
  profile,
  title,
}: {
  profile: Profile;
  title?: string;
}) {
  const { setOpen } = useSidebar();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex-1">
        {title ? (
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <ThemeSwitcher />
        <UserMenu profile={profile} />
      </div>
    </header>
  );
}
