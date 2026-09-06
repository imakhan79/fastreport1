import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notificationId = Number(id);
  if (!Number.isInteger(notificationId)) {
    return NextResponse.json({ error: "Invalid notification id." }, { status: 400 });
  }

  let orgId: number, userId: string;
  try {
    ({ orgId, userId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
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
