import { LeadDetailPageClient } from "@/components/leads/lead-detail-page-client";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeadDetailPageClient leadId={id} />;
}
