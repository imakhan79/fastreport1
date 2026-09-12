import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import type { IntrospectedTable } from "@/lib/ai/query-executor";

export async function GET(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const dataSourceId = Number(req.nextUrl.searchParams.get("dataSourceId"));
  if (!Number.isInteger(dataSourceId)) {
    return NextResponse.json({ error: "Invalid dataSourceId." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: dataSource, error } = await admin
    .from("data_sources")
    .select("id, name, schema_cache")
    .eq("id", dataSourceId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !dataSource) {
    return NextResponse.json({ error: "Data source not found." }, { status: 404 });
  }

  const tables = ((dataSource.schema_cache as { tables?: IntrospectedTable[] } | null)?.tables ?? []) as IntrospectedTable[];

  return NextResponse.json({ tables });
}
