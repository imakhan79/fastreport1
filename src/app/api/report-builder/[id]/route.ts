import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import type { BuilderConfig } from "@/lib/report-builder";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("report_builder_reports")
    .select("*")
    .eq("id", reportId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  return NextResponse.json({ report: data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const dataSourceId = Number(body?.dataSourceId);
  const table = typeof body?.table === "string" ? body.table : "";
  const config = body?.config as BuilderConfig | undefined;

  if (!name || !Number.isInteger(dataSourceId) || !table || !config) {
    return NextResponse.json({ error: "Missing name, dataSourceId, table, or config." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("report_builder_reports")
    .update({ name, data_source_id: dataSourceId, table_name: table, config })
    .eq("id", reportId)
    .eq("org_id", orgId)
    .select("id, name, table_name, data_source_id, config, updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to update report." }, { status: 500 });

  return NextResponse.json({ report: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("report_builder_reports").delete().eq("id", reportId).eq("org_id", orgId);

  if (error) return NextResponse.json({ error: "Failed to delete report." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
