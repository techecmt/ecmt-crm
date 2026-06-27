import { LeadsPageClient } from "@/components/leads/leads-page-client";
import { requireModule } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const profile = await requireModule("leads");
  return (
    <LeadsPageClient
      canDelete={isAdminRole(profile.role)}
      currentUserId={profile.id}
      isSuperAdmin={profile.role === "super_admin"}
    />
  );
}
