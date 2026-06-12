import { FollowUpsPageClient } from "@/components/follow-ups/follow-ups-page-client";
import { requireModule } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const profile = await requireModule("follow_ups");
  return <FollowUpsPageClient currentUserId={profile.id} role={profile.role} />;
}
