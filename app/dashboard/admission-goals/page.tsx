import { AdmissionGoalsPageClient } from "@/components/admission-goals/admission-goals-page-client";
import { requireModule } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdmissionGoalsPage() {
  const profile = await requireModule("admission_goals");
  return (
    <AdmissionGoalsPageClient
      canManage={isAdminRole(profile.role)}
      currentUserId={profile.id}
      currentRole={profile.role}
    />
  );
}
