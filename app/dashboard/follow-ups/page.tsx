import { redirect } from "next/navigation";

import { FollowUpsPageClient } from "@/components/follow-ups/follow-ups-page-client";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  return <FollowUpsPageClient currentUserId={profile.id} role={profile.role} />;
}
