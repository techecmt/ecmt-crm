import { LeadsPageClient } from "@/components/leads/leads-page-client";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const profile = await getCurrentProfile();
  return <LeadsPageClient canDelete={isAdminRole(profile?.role)} />;
}
