import { DashboardUnderConstruction } from "@/components/dashboard/dashboard-under-construction";
import { requireModule } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireModule("dashboard");
  return <DashboardUnderConstruction />;
}
