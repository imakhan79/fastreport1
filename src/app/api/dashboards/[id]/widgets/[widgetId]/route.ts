import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; widgetId: string }> }) {
  const { id, widgetId } = await params;
  const dashboardId = Number(id);
  const widgetIdNum = Number(widgetId);
  if (!Number.isInteger(dashboardId) || !Number.isInteger(widgetIdNum)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
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
    .from("dashboard_widgets")
    .delete()
    .eq("id", widgetIdNum)
    .eq("dashboard_id", dashboardId)
    .eq("org_id", orgId);

  if (error) return NextResponse.json({ error: "Failed to delete widget." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
