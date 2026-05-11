import { CollegesPageClient } from "@/components/colleges/colleges-page-client";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CollegesPage() {
  const profile = await getCurrentProfile();
  const canManage = isAdminRole(profile?.role);
  return <CollegesPageClient canManage={canManage} />;
}
