import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dashboardId = Number(id);
  if (!Number.isInteger(dashboardId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await req.json().catch(() => null);
  const order = body?.order;
  if (!Array.isArray(order) || !order.every((n) => Number.isInteger(n))) {
    return NextResponse.json({ error: "'order' must be an array of widget ids." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: widgets } = await admin
    .from("dashboard_widgets")
    .select("id")
    .eq("dashboard_id", dashboardId)
    .eq("org_id", orgId);

  const validIds = new Set((widgets ?? []).map((w) => w.id));
  if (order.length !== validIds.size || !order.every((wid) => validIds.has(wid))) {
    return NextResponse.json({ error: "'order' must contain exactly this dashboard's widget ids." }, { status: 400 });
  }

  await Promise.all(
    order.map((widgetId: number, index: number) =>
      admin.from("dashboard_widgets").update({ position: index }).eq("id", widgetId).eq("org_id", orgId)
    )
  );

  return NextResponse.json({ ok: true });
}
