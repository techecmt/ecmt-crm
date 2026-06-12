import { ReportsPageClient } from "@/components/reports/reports-page-client";
import { requireProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const profile = await requireProfile();
  // Everyone sees User Reports; only Super Admins additionally see Admin Reports.
  return <ReportsPageClient isAdmin={profile.role === "super_admin"} />;
}
