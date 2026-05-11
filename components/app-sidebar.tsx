"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Settings2,
  Trello,
  Users,
  UsersRound,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { UserRole } from "@/lib/types";
import { isAdminRole } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "Leads", icon: UsersRound },
  { href: "/dashboard/follow-ups", label: "Follow-ups", icon: ListChecks },
  { href: "/dashboard/admissions", label: "Admissions", icon: Trello },
  { href: "/dashboard/colleges", label: "Colleges", icon: Building2 },
  { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone },
  { href: "/dashboard/forms", label: "Forms", icon: ClipboardList },
  { href: "/dashboard/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
];

interface SidebarContext {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContext | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>");
  return ctx;
}

function NavList({
  role,
  onNavigate,
}: {
  role: UserRole;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdminRole(role));
  return (
    <nav className="grid gap-1 p-2 text-sm">
      {items.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive &&
                "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar({ role }: { role: UserRole }) {
  const { open, setOpen } = useSidebar();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetHeader className="border-b p-4 text-left">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                <GraduationCap className="h-5 w-5" />
                College CRM
              </SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SheetDescription className="sr-only">
              Main navigation
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-4rem)]">
            <NavList role={role} onNavigate={() => setOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
        <GraduationCap className="h-5 w-5" />
        <span>College CRM</span>
      </div>
      <ScrollArea className="flex-1">
        <NavList role={role} />
      </ScrollArea>
      <Separator />
      <div className="p-3 text-xs text-sidebar-muted-foreground">
        v0.1 · Centralised CRM
      </div>
    </aside>
  );
}
