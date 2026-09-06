import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultOrgAndUser } from "@/lib/bootstrap";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notificationId = Number(id);
  if (!Number.isInteger(notificationId)) {
    return NextResponse.json({ error: "Invalid notification id." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { orgId, userId } = await ensureDefaultOrgAndUser();

  const { error } = await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to update notification." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
