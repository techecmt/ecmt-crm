import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import {
  isValidWorkerSecret,
  resolveBaseUrl,
  triggerCampaignWorker,
} from "@/lib/messaging/campaign-worker";
import { processCampaignBatch, requeueStalledRecipients } from "@/lib/messaging/campaigns";
import { isAdminRole } from "@/lib/types";

// Each invocation sends one batch, then hands off to the next. Keeping the
// per-request work small is what makes bulk sending survive serverless limits.
export const maxDuration = 60;

async function isAuthorised(request: NextRequest) {
  if (isValidWorkerSecret(request.headers.get("x-campaign-worker-secret"))) return true;
  const profile = await getCurrentProfile();
  return Boolean(profile && isAdminRole(profile.role));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthorised(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Recover anything a previous invocation claimed but never finished.
    await requeueStalledRecipients(id);
    const result = await processCampaignBatch(id);

    if (result.remaining > 0 && (result.status === "sending" || result.status === "queued")) {
      const baseUrl = resolveBaseUrl(request);
      if (process.env.NODE_ENV === "production") {
        after(() => triggerCampaignWorker(baseUrl, id));
      } else {
        // In local/dev, keep chaining synchronously to avoid stalled queues.
        void triggerCampaignWorker(baseUrl, id);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Campaign] Batch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Campaign batch failed" },
      { status: 500 },
    );
  }
}
