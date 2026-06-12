import { LeadDetailPageClient } from "@/components/leads/lead-detail-page-client";
import { requireModule } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("leads");
  const { id } = await params;
  return <LeadDetailPageClient leadId={id} />;
}
