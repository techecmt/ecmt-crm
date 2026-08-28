import { redirect } from "next/navigation";

import { CampaignsPageClient } from "@/components/message-centre/campaigns/campaigns-page-client";
import { requireModule } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WhatsAppCampaignsPage() {
  const profile = await requireModule("message_centre");
  // Bulk sending is admin-only, matching the RLS on campaigns and connections.
  if (!isAdminRole(profile.role)) redirect("/dashboard/message-centre");

  return <CampaignsPageClient />;
}
