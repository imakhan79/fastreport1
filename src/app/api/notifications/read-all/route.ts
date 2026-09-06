import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultOrgAndUser } from "@/lib/bootstrap";

export async function POST() {
  const admin = createAdminClient();
  const { orgId, userId } = await ensureDefaultOrgAndUser();

  const { error } = await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: "Failed to update notifications." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
