import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { resolveConnectionString, introspectSchema, ConnectionError } from "@/lib/ai/query-executor";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dataSourceId = Number(id);
  if (!Number.isInteger(dataSourceId)) {
    return NextResponse.json({ error: "Invalid data source id." }, { status: 400 });
  }

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("data_sources").delete().eq("id", dataSourceId).eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete data source." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dataSourceId = Number(id);
  if (!Number.isInteger(dataSourceId)) {
    return NextResponse.json({ error: "Invalid data source id." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (body?.action !== "refresh") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { data: dataSource, error: fetchError } = await admin
    .from("data_sources")
    .select("*")
    .eq("id", dataSourceId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (fetchError || !dataSource) {
    return NextResponse.json({ error: "Data source not found." }, { status: 404 });
  }

  let tables;
  try {
    tables = await introspectSchema(resolveConnectionString(dataSource.connection_ref));
  } catch (error) {
    const message = error instanceof ConnectionError ? error.message : "Could not connect to that database.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("data_sources")
    .update({ schema_cache: { tables } })
    .eq("id", dataSourceId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to save refreshed schema." }, { status: 500 });
  }

  return NextResponse.json({ tableNames: tables.map((t) => t.name) });
}
