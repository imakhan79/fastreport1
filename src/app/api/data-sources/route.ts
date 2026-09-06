import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { introspectSchema, ConnectionError } from "@/lib/ai/query-executor";

const CONNECTION_STRING_PATTERN = /^postgres(ql)?:\/\/\S+$/i;

export async function GET() {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();

  const { data: dataSources, error } = await admin
    .from("data_sources")
    .select("id, name, kind, schema_cache, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load data sources." }, { status: 500 });
  }

  // Never return connection_ref - it can hold real credentials.
  const enriched = dataSources.map((ds) => {
    const tables = (ds.schema_cache as { tables?: { name: string }[] } | null)?.tables ?? [];
    return {
      id: ds.id,
      name: ds.name,
      kind: ds.kind,
      created_at: ds.created_at,
      tableNames: tables.map((t) => t.name),
    };
  });

  return NextResponse.json({ dataSources: enriched });
}

export async function POST(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const connectionString = typeof body?.connectionString === "string" ? body.connectionString.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Missing 'name'." }, { status: 400 });
  }
  if (!CONNECTION_STRING_PATTERN.test(connectionString)) {
    return NextResponse.json(
      { error: "connectionString must be a postgres:// or postgresql:// URI." },
      { status: 400 }
    );
  }

  let tables;
  try {
    tables = await introspectSchema(connectionString);
  } catch (error) {
    const message = error instanceof ConnectionError ? error.message : "Could not connect to that database.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (tables.length === 0) {
    return NextResponse.json(
      { error: "Connected successfully, but no tables were found in the public schema." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: dataSource, error: insertError } = await admin
    .from("data_sources")
    .insert({
      org_id: orgId,
      name,
      kind: "postgres",
      connection_ref: connectionString,
      schema_cache: { tables },
    })
    .select("id, name, kind, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to save data source." }, { status: 500 });
  }

  return NextResponse.json({ dataSource: { ...dataSource, tableNames: tables.map((t) => t.name) } });
}
