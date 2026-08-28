import { NextRequest, NextResponse } from "next/server";

import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import {
  TWILIO_TEMPLATE_CATEGORIES,
  createTwilioContentTemplate,
  deleteTwilioContentTemplate,
  listApprovedTwilioWhatsAppTemplates,
  listTwilioContentTemplates,
  submitTwilioTemplateForApproval,
  toWhatsAppTemplateName,
  type TwilioTemplateCategory,
} from "@/lib/messaging/twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

type ConnectionCredentials = {
  account_sid: string;
  auth_token: string;
  whatsapp_from: string | null;
  messaging_service_sid: string | null;
};

async function loadConnectionCredentials(connectionId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("twilio_connections")
    .select("account_sid, auth_token, whatsapp_from, messaging_service_sid")
    .eq("id", connectionId)
    .single();
  if (error || !data) return null;
  return data as ConnectionCredentials;
}

function twilioErrorResponse(error: unknown, fallback: string) {
  console.error(`[API] ${fallback}:`, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 502 },
  );
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const conversationId = request.nextUrl.searchParams.get("conversation_id");
  const requestedConnectionId = request.nextUrl.searchParams.get("connection_id");
  // Template management needs unapproved drafts too; the composer only wants approved ones.
  const includeAll = request.nextUrl.searchParams.get("include_all") === "1";

  if (includeAll && !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let twilioConnectionId: string | null = requestedConnectionId;
  if (conversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("channel, provider, twilio_connection_id")
      .eq("id", conversationId)
      .single();
    if (conversationError || !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (conversation.channel !== "whatsapp" || conversation.provider !== "twilio") {
      return NextResponse.json(
        { error: "Templates are available only for Twilio WhatsApp conversations" },
        { status: 400 },
      );
    }
    twilioConnectionId = conversation.twilio_connection_id ?? null;
  }

  let connection: ConnectionCredentials | null = null;
  if (twilioConnectionId) {
    connection = await loadConnectionCredentials(twilioConnectionId);
    if (!connection) {
      return NextResponse.json({ error: "Twilio connection not found" }, { status: 404 });
    }
  }

  try {
    const templates = includeAll
      ? await listTwilioContentTemplates(connection ?? undefined)
      : await listApprovedTwilioWhatsAppTemplates(connection ?? undefined);
    return NextResponse.json({ templates });
  } catch (error) {
    return twilioErrorResponse(error, "Failed to load Twilio templates");
  }
}

type CreateTemplateBody = {
  connectionId?: unknown;
  friendlyName?: unknown;
  language?: unknown;
  body?: unknown;
  variableSamples?: unknown;
  submitForApproval?: unknown;
  approvalName?: unknown;
  category?: unknown;
};

/**
 * Creates a Twilio Content template and optionally submits it to WhatsApp.
 * Content resources are immutable, so "editing" a template means creating a new
 * one here and retiring the old SID.
 */
export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json()) as CreateTemplateBody;
  const friendlyName =
    typeof payload.friendlyName === "string" ? payload.friendlyName.trim() : "";
  const templateBody = typeof payload.body === "string" ? payload.body.trim() : "";
  const language =
    typeof payload.language === "string" && payload.language.trim()
      ? payload.language.trim()
      : "en";

  if (!friendlyName) {
    return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  }
  if (!templateBody) {
    return NextResponse.json({ error: "Template body is required" }, { status: 400 });
  }
  if (templateBody.length > 1024) {
    return NextResponse.json(
      { error: "Template body must be 1024 characters or fewer" },
      { status: 400 },
    );
  }

  const category = payload.category as TwilioTemplateCategory | undefined;
  const submitForApproval = payload.submitForApproval === true;
  if (submitForApproval && (!category || !TWILIO_TEMPLATE_CATEGORIES.includes(category))) {
    return NextResponse.json(
      { error: "A WhatsApp category is required to submit for approval" },
      { status: 400 },
    );
  }

  let connection: ConnectionCredentials | null = null;
  if (typeof payload.connectionId === "string" && payload.connectionId) {
    connection = await loadConnectionCredentials(payload.connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Twilio connection not found" }, { status: 404 });
    }
  }

  const variableSamples: Record<string, string> = {};
  if (payload.variableSamples && typeof payload.variableSamples === "object") {
    for (const [key, value] of Object.entries(
      payload.variableSamples as Record<string, unknown>,
    )) {
      if (typeof value === "string") variableSamples[key] = value;
    }
  }

  try {
    const template = await createTwilioContentTemplate({
      friendlyName,
      language,
      body: templateBody,
      variableSamples,
      credentials: connection ?? undefined,
    });

    if (!template) {
      return NextResponse.json({ error: "Twilio did not return a template" }, { status: 502 });
    }

    let approvalSubmitted = false;
    let approvalError: string | null = null;
    if (submitForApproval && category) {
      const approvalName =
        typeof payload.approvalName === "string" && payload.approvalName.trim()
          ? toWhatsAppTemplateName(payload.approvalName)
          : toWhatsAppTemplateName(friendlyName);
      try {
        await submitTwilioTemplateForApproval({
          contentSid: template.sid,
          name: approvalName,
          category,
          credentials: connection ?? undefined,
        });
        approvalSubmitted = true;
      } catch (error) {
        // The template exists either way; surface the approval failure separately
        // so the admin can resubmit rather than losing the draft.
        approvalError =
          error instanceof Error ? error.message : "Failed to submit for approval";
      }
    }

    return NextResponse.json({ template, approvalSubmitted, approvalError });
  } catch (error) {
    return twilioErrorResponse(error, "Failed to create Twilio template");
  }
}

type ApprovalBody = {
  connectionId?: unknown;
  contentSid?: unknown;
  approvalName?: unknown;
  category?: unknown;
};

/** Submits an existing template for WhatsApp approval (or resubmits a rejected one). */
export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json()) as ApprovalBody;
  const contentSid = typeof payload.contentSid === "string" ? payload.contentSid.trim() : "";
  const category = payload.category as TwilioTemplateCategory | undefined;

  if (!/^HX[a-fA-F0-9]{32}$/.test(contentSid)) {
    return NextResponse.json({ error: "A valid Content SID is required" }, { status: 400 });
  }
  if (!category || !TWILIO_TEMPLATE_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "A WhatsApp category is required" }, { status: 400 });
  }

  let connection: ConnectionCredentials | null = null;
  if (typeof payload.connectionId === "string" && payload.connectionId) {
    connection = await loadConnectionCredentials(payload.connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Twilio connection not found" }, { status: 404 });
    }
  }

  const approvalName =
    typeof payload.approvalName === "string" && payload.approvalName.trim()
      ? toWhatsAppTemplateName(payload.approvalName)
      : "";
  if (!approvalName) {
    return NextResponse.json({ error: "A WhatsApp template name is required" }, { status: 400 });
  }

  try {
    await submitTwilioTemplateForApproval({
      contentSid,
      name: approvalName,
      category,
      credentials: connection ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return twilioErrorResponse(error, "Failed to submit template for approval");
  }
}

export async function DELETE(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentSid = request.nextUrl.searchParams.get("sid")?.trim() ?? "";
  const connectionId = request.nextUrl.searchParams.get("connection_id");
  if (!/^HX[a-fA-F0-9]{32}$/.test(contentSid)) {
    return NextResponse.json({ error: "A valid Content SID is required" }, { status: 400 });
  }

  let connection: ConnectionCredentials | null = null;
  if (connectionId) {
    connection = await loadConnectionCredentials(connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Twilio connection not found" }, { status: 404 });
    }
  }

  try {
    await deleteTwilioContentTemplate(contentSid, connection ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return twilioErrorResponse(error, "Failed to delete Twilio template");
  }
}
