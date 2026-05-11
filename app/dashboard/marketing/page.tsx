import { MarketingPageClient } from "@/components/marketing/marketing-page-client";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("*");
  return <MarketingPageClient leads={(data ?? []) as Lead[]} />;
}
