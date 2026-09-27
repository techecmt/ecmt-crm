import { Megaphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type MetaAttributionView = {
  source?: string | null;
  source_platform?: string | null;
  meta_campaign_id?: string | null;
  meta_campaign_name?: string | null;
  meta_adset_id?: string | null;
  meta_adset_name?: string | null;
  meta_ad_id?: string | null;
  meta_ad_name?: string | null;
  meta_ctwa_clid?: string | null;
  meta_referral_source_id?: string | null;
  meta_referral_source_type?: string | null;
  meta_referral_source_url?: string | null;
  meta_referral_headline?: string | null;
  meta_referral_body?: string | null;
  meta_referral_media_id?: string | null;
  meta_referral_media_url?: string | null;
  attribution_captured_at?: string | null;
};

function hasMetaAttribution(data: MetaAttributionView | null | undefined) {
  return Boolean(data?.attribution_captured_at || data?.meta_ctwa_clid || data?.meta_referral_source_id);
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <p className="text-sm break-words">{value}</p>
    </div>
  );
}

export function MetaAttributionSummary({
  data,
  compact = false,
}: {
  data: MetaAttributionView | null | undefined;
  compact?: boolean;
}) {
  if (!hasMetaAttribution(data)) return null;

  if (compact) {
    return (
      <div className="rounded-md border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
        <div className="flex flex-wrap items-center gap-1.5 font-medium text-emerald-900 dark:text-emerald-100">
          <Megaphone className="h-3.5 w-3.5" />
          Meta Click-to-WhatsApp
        </div>
        <p className="mt-1 text-muted-foreground">
          {[data?.meta_campaign_name, data?.meta_adset_name, data?.meta_ad_name]
            .filter(Boolean)
            .join(" · ") || "Ad referral captured — names pending or unavailable"}
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-emerald-600" />
          <CardTitle className="text-base">Meta ad attribution</CardTitle>
          <Badge variant="outline" className="ml-auto">
            Click-to-WhatsApp
          </Badge>
        </div>
        <CardDescription>
          First-touch attribution from the inbound Twilio webhook (IDs kept even if names change in Ads Manager).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field label="Campaign" value={data?.meta_campaign_name} />
        <Field label="Ad set" value={data?.meta_adset_name} />
        <Field label="Ad" value={data?.meta_ad_name} />
        <Field label="Platform" value={data?.source_platform} />
        <Field label="Campaign ID" value={data?.meta_campaign_id} />
        <Field label="Ad set ID" value={data?.meta_adset_id} />
        <Field label="Ad ID" value={data?.meta_ad_id ?? data?.meta_referral_source_id} />
        <Field label="Referral source type" value={data?.meta_referral_source_type} />
        <Field label="CtWA click ID" value={data?.meta_ctwa_clid} />
        <Field label="Ad headline" value={data?.meta_referral_headline} />
        <Field label="Referral media ID" value={data?.meta_referral_media_id} />
        <div className="sm:col-span-2">
          <Field label="Referral media URL" value={data?.meta_referral_media_url} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Referral source URL" value={data?.meta_referral_source_url} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Ad body" value={data?.meta_referral_body} />
        </div>
      </CardContent>
    </Card>
  );
}
