import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scheduleId = Number(id);
  if (!Number.isInteger(scheduleId)) {
    return NextResponse.json({ error: "Invalid schedule id." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "active" && status !== "paused") {
    return NextResponse.json({ error: "status must be 'active' or 'paused'." }, { status: 400 });
  }

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("report_schedules")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", scheduleId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: "Failed to update schedule." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scheduleId = Number(id);
  if (!Number.isInteger(scheduleId)) {
    return NextResponse.json({ error: "Invalid schedule id." }, { status: 400 });
  }

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("report_schedules").delete().eq("id", scheduleId).eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete schedule." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
