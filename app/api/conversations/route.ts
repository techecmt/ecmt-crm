import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select(
      `
      id,
      phone,
      name,
      mode,
      lead_id,
      updated_at,
      created_at,
      messages (
        content,
        role,
        created_at
      )
    `
    )
    .order("updated_at", { ascending: false })
    .order("created_at", {
      referencedTable: "messages",
      ascending: false,
    })
    .limit(1, { referencedTable: "messages" });

  if (error) {
    console.error("[API] Failed to fetch conversations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const formatted = (conversations || []).map((c) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    mode: c.mode,
    lead_id: c.lead_id,
    updated_at: c.updated_at,
    created_at: c.created_at,
    last_message: c.messages?.[0] || null,
  }));

  return NextResponse.json(formatted);
}
