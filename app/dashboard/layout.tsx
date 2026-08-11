import { redirect } from "next/navigation";

import { AppSidebar, SidebarProvider } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { NavigationProgress } from "@/components/navigation-progress";
import { CrmEntryTracker } from "@/components/reports/crm-entry-tracker";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  return (
    <SidebarProvider>
      <NavigationProgress />
      <div className="flex min-h-screen w-full bg-muted/20">
        <CrmEntryTracker />
        <AppSidebar profile={profile} />
        <div className="flex min-h-screen flex-1 flex-col">
          <DashboardHeader profile={profile} />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
