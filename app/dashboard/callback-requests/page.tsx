import { CallbackRequestsPageClient } from "@/components/callback-requests/callback-requests-page-client";
import { requireModule } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CallbackRequestsPage() {
  await requireModule("leads");
  return <CallbackRequestsPageClient />;
}
