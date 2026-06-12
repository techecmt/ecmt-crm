import { FormsPageClient } from "@/components/forms/forms-page-client";
import { requireModule } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  await requireModule("forms");
  return <FormsPageClient />;
}
