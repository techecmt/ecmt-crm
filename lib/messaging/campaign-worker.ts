import "server-only";

import { createHash, timingSafeEqual } from "crypto";

/**
 * Shared secret the campaign worker uses to call itself. Defaults to a hash of
 * the service-role key so no extra configuration is required; override with
 * CAMPAIGN_WORKER_SECRET if you prefer to rotate it independently.
 */
export function campaignWorkerSecret() {
  const explicit = process.env.CAMPAIGN_WORKER_SECRET?.trim();
  if (explicit) return explicit;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return "";
  return createHash("sha256").update(`campaign-worker:${serviceRoleKey}`).digest("hex");
}

export function isValidWorkerSecret(provided: string | null) {
  const expected = campaignWorkerSecret();
  if (!expected || !provided) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/** Absolute origin of this deployment, for the worker's self-invocation. */
export function resolveBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const protocol =
    request.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/**
 * Kicks the next batch. Called from `after()`, so it runs once the current
 * response is already sent — which means each invocation only ever overlaps the
 * one it triggered, rather than the whole remaining chain.
 */
export async function triggerCampaignWorker(baseUrl: string, campaignId: string) {
  const secret = campaignWorkerSecret();
  if (!secret) {
    console.error("[Campaign] No worker secret available; cannot continue sending.");
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/messaging/campaigns/${campaignId}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-campaign-worker-secret": secret,
      },
      body: "{}",
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[Campaign] Worker trigger failed (${response.status} ${response.statusText}): ${body || "<empty>"}`,
      );
    }
  } catch (error) {
    console.error("[Campaign] Failed to trigger worker:", error);
  }
}
