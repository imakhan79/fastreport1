import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import type { BuilderConfig } from "@/lib/report-builder-types";

const WIDGET_TYPES = ["kpi", "chart", "table"] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { data: dashboard } = await admin
    .from("dashboards")
    .select("id")
    .eq("id", dashboardId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!dashboard) return NextResponse.json({ error: "Dashboard not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const widgetType = body?.widgetType;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const dataSourceId = Number(body?.dataSourceId);
  const table = typeof body?.table === "string" ? body.table : "";
  const config = body?.config as BuilderConfig | undefined;

  if (!WIDGET_TYPES.includes(widgetType) || !title || !Number.isInteger(dataSourceId) || !table || !config) {
    return NextResponse.json({ error: "Missing or invalid widgetType, title, dataSourceId, table, or config." }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("dashboard_widgets")
    .select("position")
    .eq("dashboard_id", dashboardId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await admin
    .from("dashboard_widgets")
    .insert({
      org_id: orgId,
      dashboard_id: dashboardId,
      widget_type: widgetType,
      title,
      data_source_id: dataSourceId,
      table_name: table,
      config,
      position: nextPosition,
    })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to add widget." }, { status: 500 });

  return NextResponse.json({ widget: data });
}
