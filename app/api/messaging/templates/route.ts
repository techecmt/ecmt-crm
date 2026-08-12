import { NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { listApprovedTwilioWhatsAppTemplates } from "@/lib/messaging/twilio";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const templates = await listApprovedTwilioWhatsAppTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[API] Failed to load Twilio templates:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Twilio templates",
      },
      { status: 502 },
    );
  }
}
