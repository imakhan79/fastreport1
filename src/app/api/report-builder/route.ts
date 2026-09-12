import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { assertDataSourceTable, ReportBuilderError, type BuilderConfig } from "@/lib/report-builder";

export async function GET() {
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
    .select("id, name, table_name, data_source_id, config, updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to load saved reports." }, { status: 500 });

  return NextResponse.json({ reports: data ?? [] });
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
  const dataSourceId = Number(body?.dataSourceId);
  const table = typeof body?.table === "string" ? body.table : "";
  const config = body?.config as BuilderConfig | undefined;

  if (!name || !Number.isInteger(dataSourceId) || !table || !config) {
    return NextResponse.json({ error: "Missing name, dataSourceId, table, or config." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    await assertDataSourceTable(admin, orgId, dataSourceId, table);
  } catch (err) {
    if (err instanceof ReportBuilderError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const { data, error } = await admin
    .from("report_builder_reports")
    .insert({
      org_id: orgId,
      created_by: userId,
      name,
      data_source_id: dataSourceId,
      table_name: table,
      config,
    })
    .select("id, name, table_name, data_source_id, config, updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to save report." }, { status: 500 });

  return NextResponse.json({ report: data });
}
