import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messaging_pages")
    .select("id, name, page_id, channel, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    page_id?: string;
    access_token?: string;
    channel?: "messenger";
    is_active?: boolean;
  };

  if (!body.name?.trim() || !body.page_id?.trim() || !body.access_token?.trim()) {
    return NextResponse.json(
      { error: "name, page_id and access_token are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messaging_pages")
    .insert({
      name: body.name.trim(),
      page_id: body.page_id.trim(),
      access_token: body.access_token.trim(),
      channel: body.channel ?? "messenger",
      is_active: body.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .select("id, name, page_id, channel, is_active, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
