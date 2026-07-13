import { redirect } from "next/navigation";

import { UsersPageClient } from "@/components/users/users-page-client";
import { requireModule } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const profile = await requireModule("users");
  if (!isAdminRole(profile.role)) redirect("/dashboard/leads");
  return (
    <UsersPageClient
      currentUserId={profile.id}
      canManageAuth={profile.role === "super_admin"}
    />
  );
}
