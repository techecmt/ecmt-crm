"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageCircle,
  Settings2,
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
import type { AppModule } from "@/lib/types";
import { isAdminRole, getUserModules, type Profile } from "@/lib/types";

type NavChild = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  module?: AppModule;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  module?: AppModule;
  children?: NavChild[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    module: "dashboard",
    superAdminOnly: true,
  },
  {
    href: "/dashboard/leads",
    label: "Leads",
    icon: UsersRound,
    module: "leads",
    children: [
      { href: "/dashboard/leads", label: "All leads", icon: UsersRound, module: "leads" },
      { href: "/dashboard/follow-ups", label: "Follow-ups", icon: ListChecks, module: "follow_ups" },
    ],
  },
  {
    href: "/dashboard/message-centre",
    label: "Message Centre",
    icon: MessageCircle,
    module: "message_centre",
    children: [
      { href: "/dashboard/message-centre", label: "Inbox", icon: MessageCircle, module: "message_centre" },
      {
        href: "/dashboard/message-centre/settings",
        label: "Settings",
        icon: Settings2,
        adminOnly: true,
        module: "message_centre",
      },
    ],
  },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/colleges", label: "Colleges", icon: Building2, module: "colleges" },
  { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone, module: "marketing" },
  { href: "/dashboard/forms", label: "Forms", icon: ClipboardList, module: "forms" },
  { href: "/dashboard/users", label: "Users", icon: Users, adminOnly: true, module: "users" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2, module: "settings" },
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
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const role = profile.role;
  const allowedModules = getUserModules(profile);
  const items = NAV_ITEMS.filter(
    (i) =>
      (!i.adminOnly || isAdminRole(role)) &&
      (!i.superAdminOnly || role === "super_admin") &&
      (!i.module || allowedModules.includes(i.module)),
  );
  return (
    <nav className="grid gap-1 p-2 text-sm">
      {items.map((item) => {
        const Icon = item.icon;
        const isItemActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const hasChildren = !!item.children?.length;
        const anyChildActive = hasChildren
          ? item.children!.some((child) =>
              child.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(child.href),
            )
          : false;
        const isActive = isItemActive || anyChildActive;
        return (
          <div key={item.href}>
            <Link
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
            {hasChildren && isActive ? (
              <div className="ml-7 mt-1 grid gap-1 border-l pl-2">
                {item.children!
                  .filter(
                    (child) =>
                      (!child.adminOnly || isAdminRole(role)) &&
                      (!child.superAdminOnly || role === "super_admin") &&
                      (!child.module || allowedModules.includes(child.module)),
                  )
                  .map((child) => {
                  const ChildIcon = child.icon;
                  const childActive =
                    child.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        childActive &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                      )}
                    >
                      <ChildIcon className="h-3.5 w-3.5" />
                      <span>{child.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function AppSidebar({ profile }: { profile: Profile }) {
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
            <NavList profile={profile} onNavigate={() => setOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
        <GraduationCap className="h-5 w-5" />
        <span>Edusphere Group CRM</span>
      </div>
      <ScrollArea className="flex-1">
        <NavList profile={profile} />
      </ScrollArea>
      <Separator />
      <div className="p-3 text-xs text-sidebar-muted-foreground">
        v0.1 · Centralised CRM
      </div>
    </aside>
  );
}
