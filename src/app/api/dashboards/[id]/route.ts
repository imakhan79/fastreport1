import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const admin = createAdminClient();
  const { data: dashboard, error } = await admin
    .from("dashboards")
    .select("*")
    .eq("id", dashboardId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !dashboard) return NextResponse.json({ error: "Dashboard not found." }, { status: 404 });

  const { data: widgets, error: widgetsError } = await admin
    .from("dashboard_widgets")
    .select("*")
    .eq("dashboard_id", dashboardId)
    .order("position", { ascending: true });

  if (widgetsError) return NextResponse.json({ error: "Failed to load dashboard widgets." }, { status: 500 });

  return NextResponse.json({ dashboard, widgets: widgets ?? [] });
}

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
  const patch: { name?: string; refresh_seconds?: number } = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body?.refreshSeconds === "number" && body.refreshSeconds >= 0) patch.refresh_seconds = Math.floor(body.refreshSeconds);

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dashboards")
    .update(patch)
    .eq("id", dashboardId)
    .eq("org_id", orgId)
    .select("id, name, refresh_seconds, updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to update dashboard." }, { status: 500 });

  return NextResponse.json({ dashboard: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const admin = createAdminClient();
  const { error } = await admin.from("dashboards").delete().eq("id", dashboardId).eq("org_id", orgId);

  if (error) return NextResponse.json({ error: "Failed to delete dashboard." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
