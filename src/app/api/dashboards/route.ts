import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { data: dashboards, error } = await admin
    .from("dashboards")
    .select("id, name, refresh_seconds, updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to load dashboards." }, { status: 500 });

  const { data: widgetCounts } = await admin
    .from("dashboard_widgets")
    .select("dashboard_id")
    .eq("org_id", orgId);

  const counts = new Map<number, number>();
  for (const w of widgetCounts ?? []) counts.set(w.dashboard_id, (counts.get(w.dashboard_id) ?? 0) + 1);

  return NextResponse.json({
    dashboards: (dashboards ?? []).map((d) => ({ ...d, widgetCount: counts.get(d.id) ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  let orgId: number, userId: string;
  try {
    ({ orgId, userId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Missing 'name'." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dashboards")
    .insert({ org_id: orgId, created_by: userId, name })
    .select("id, name, refresh_seconds, updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to create dashboard." }, { status: 500 });

  return NextResponse.json({ dashboard: data });
}
