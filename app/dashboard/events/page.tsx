export const dynamic = "force-dynamic";

import { requireModule } from "@/lib/auth";
import { EventsPageClient } from "@/components/events/events-page-client";

export default async function EventsPage() {
  const profile = await requireModule("events");
  const canManage =
    profile.role === "super_admin" || profile.role === "management";

  return <EventsPageClient canManage={canManage} />;
}
