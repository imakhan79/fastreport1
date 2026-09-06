import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function POST() {
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
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: "Failed to update notifications." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
