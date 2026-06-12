import { MarketingPageClient } from "@/components/marketing/marketing-page-client";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  await requireModule("marketing");
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("*");
  return <MarketingPageClient leads={(data ?? []) as Lead[]} />;
}
