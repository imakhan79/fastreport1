import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultOrgAndUser } from "@/lib/bootstrap";

export async function GET() {
  const admin = createAdminClient();
  const { orgId, userId } = await ensureDefaultOrgAndUser();

  const { data: notifications, error } = await admin
    .from("notifications")
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return NextResponse.json({ notifications, unreadCount });
}
