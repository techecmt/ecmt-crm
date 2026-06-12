import { MessageCentrePageClient } from "@/components/message-centre/message-centre-page-client";
import { requireModule } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MessageCentrePage() {
  await requireModule("message_centre");
  return <MessageCentrePageClient />;
}
