import { NextResponse } from "next/server";
import { getCurrentProfile, hasModuleAccess } from "@/lib/auth";
import { canonicalizePhoneKey } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { isTerminalLeadStatus, type LeadSource, type LeadStatus } from "@/lib/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasModuleAccess(profile, "message_centre")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, name, phone, lead_id, page_id, assigned_user_id")
    .eq("id", id)
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (conversation.lead_id) {
    return NextResponse.json(
      { error: "Conversation is already linked to a lead" },
      { status: 400 },
    );
  }
  const phoneKey = canonicalizePhoneKey(conversation.phone);
  if (!phoneKey) {
    return NextResponse.json(
      { error: "Valid phone number is required to convert to lead" },
      { status: 400 },
    );
  }

  // The same phone can legitimately have several leads (one per course), so
  // link to the most recent active one, falling back to the newest overall.
  const { data: existingLeads } = await supabase
    .from("leads")
    .select("id, status")
    .eq("phone_key", phoneKey)
    .order("created_at", { ascending: false });

  const existingLead =
    (existingLeads ?? []).find((l) => !isTerminalLeadStatus(l.status as LeadStatus)) ??
    (existingLeads ?? [])[0];

  let leadId = existingLead?.id ?? null;
  if (!leadId) {
    let source: LeadSource = "facebook_organic";
    if (conversation.page_id) {
      const { data: page } = await supabase
        .from("messaging_pages")
        .select("name")
        .eq("page_id", conversation.page_id)
        .single();
      if (page?.name?.toLowerCase().includes("ads")) {
        source = "meta_ads";
      }
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        full_name: conversation.name || `Message lead ${conversation.phone}`,
        phone: conversation.phone,
        phone_key: phoneKey,
        source,
        status: "inquiry_received",
        lead_score: 0,
        assigned_counsellor: conversation.assigned_user_id || null,
      })
      .select("id")
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: leadError?.message || "Failed to create lead" },
        { status: 500 },
      );
    }
    leadId = lead.id;

    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      user_id: profile.id,
      type: "system",
      title: "Lead created from Message Centre",
      description: `Converted conversation ${conversation.id} to lead.`,
    });
  }

  const { error: linkError } = await supabase
    .from("conversations")
    .update({ lead_id: leadId })
    .eq("id", conversation.id);

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: profile.id,
    type: "system",
    title: "Conversation linked",
    description: `Linked Message Centre conversation ${conversation.id}.`,
  });

  return NextResponse.json({ ok: true, lead_id: leadId });
}
