import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  let orgId: number, userId: string;
  try {
    ({ orgId, userId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();

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
