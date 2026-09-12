import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { runBuilderQuery, ReportBuilderError, type BuilderConfig } from "@/lib/report-builder";
import { QueryExecutionError, ConnectionError } from "@/lib/ai/query-executor";

const PREVIEW_LIMIT = 200;

export async function POST(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await req.json().catch(() => null);
  const dataSourceId = Number(body?.dataSourceId);
  const table = typeof body?.table === "string" ? body.table : "";
  const config = body?.config as BuilderConfig | undefined;

  if (!Number.isInteger(dataSourceId) || !table || !config) {
    return NextResponse.json({ error: "Missing dataSourceId, table, or config." }, { status: 400 });
  }

  try {
    const result = await runBuilderQuery(createAdminClient(), orgId, dataSourceId, table, config, PREVIEW_LIMIT);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReportBuilderError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ConnectionError) return NextResponse.json({ error: `Connection failed: ${error.message}` }, { status: 400 });
    if (error instanceof QueryExecutionError) return NextResponse.json({ error: `Query failed: ${error.message}` }, { status: 400 });
    console.error("report-builder query failed:", error);
    return NextResponse.json({ error: "Unexpected error running the query." }, { status: 500 });
  }
}
