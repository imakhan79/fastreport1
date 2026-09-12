import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { introspectSchema, ConnectionError } from "@/lib/ai/query-executor";
import {
  fetchRestApiData,
  syncRestApiTable,
  RestConnectorError,
  type AuthType,
  type RestConnectorConfig,
  type RestConnectorSecret,
} from "@/lib/ai/rest-connector";

const CONNECTION_STRING_PATTERN = /^postgres(ql)?:\/\/\S+$/i;
const AUTH_TYPES: readonly AuthType[] = ["none", "api_key_header", "bearer"];

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
    .select("id, name, kind, schema_cache, connector_config, last_synced_at, sync_error, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load data sources." }, { status: 500 });
  }

  // Never return connection_ref/connector_secret - they can hold real credentials.
  const enriched = dataSources.map((ds) => {
    const tables = (ds.schema_cache as { tables?: { name: string }[] } | null)?.tables ?? [];
    const config = ds.connector_config as RestConnectorConfig | null;
    return {
      id: ds.id,
      name: ds.name,
      kind: ds.kind,
      created_at: ds.created_at,
      tableNames: tables.map((t) => t.name),
      url: ds.kind === "rest_api" ? config?.url : undefined,
      lastSyncedAt: ds.last_synced_at,
      syncError: ds.sync_error,
    };
  });

  return NextResponse.json({ dataSources: enriched });
}

function validateRestConfig(body: Record<string, unknown>): { config: RestConnectorConfig; secret: RestConnectorSecret } | { error: string } {
  const raw = (body.connectorConfig ?? {}) as Record<string, unknown>;
  const secretRaw = (body.connectorSecret ?? {}) as Record<string, unknown>;

  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const authType = raw.authType as AuthType;
  if (!url) return { error: "Missing API URL." };
  if (!AUTH_TYPES.includes(authType)) return { error: "Invalid auth type." };

  const config: RestConnectorConfig = {
    url,
    authType,
    headerName: typeof raw.headerName === "string" ? raw.headerName.trim() : undefined,
    responsePath: typeof raw.responsePath === "string" ? raw.responsePath.trim() : undefined,
    paginated: Boolean(raw.paginated),
    pageParam: typeof raw.pageParam === "string" ? raw.pageParam.trim() : undefined,
    maxPages: typeof raw.maxPages === "number" ? raw.maxPages : undefined,
  };

  const secret: RestConnectorSecret = {
    apiKey: typeof secretRaw.apiKey === "string" ? secretRaw.apiKey : undefined,
    token: typeof secretRaw.token === "string" ? secretRaw.token : undefined,
  };

  if (authType === "api_key_header" && !secret.apiKey) return { error: "Missing API key value." };
  if (authType === "bearer" && !secret.token) return { error: "Missing bearer token value." };
  if (config.paginated && !config.pageParam) return { error: "Pagination requires a page parameter name." };

  return { config, secret };
}

export async function POST(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Missing 'name'." }, { status: 400 });

  const admin = createAdminClient();

  if (body?.kind === "rest_api") {
    const validated = validateRestConfig(body);
    if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
    const { config, secret } = validated;

    let parsed;
    try {
      parsed = await fetchRestApiData(config, secret);
    } catch (error) {
      const message = error instanceof RestConnectorError ? error.message : "Could not fetch that API.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const tableName = `rest_${orgId}_${Date.now()}`;
    try {
      await syncRestApiTable(orgId, tableName, parsed);
    } catch (error) {
      const message = error instanceof RestConnectorError ? error.message : "Could not load the API's data.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const { data: dataSource, error: insertError } = await admin
      .from("data_sources")
      .insert({
        org_id: orgId,
        name,
        kind: "rest_api",
        connection_ref: "upload",
        connector_config: config,
        connector_secret: secret,
        synced_table_name: tableName,
        schema_cache: { tables: [{ name: tableName, columns: parsed.columns.map((c) => ({ name: c, type: "text" })) }] },
        last_synced_at: new Date().toISOString(),
      })
      .select("id, name, kind, created_at")
      .single();

    if (insertError) {
      return NextResponse.json({ error: "Data was fetched but could not be registered as a data source." }, { status: 500 });
    }

    return NextResponse.json({
      dataSource: { ...dataSource, tableNames: [tableName] },
      rowCount: parsed.rows.length,
      columns: parsed.columns,
    });
  }

  const connectionString = typeof body?.connectionString === "string" ? body.connectionString.trim() : "";
  if (!CONNECTION_STRING_PATTERN.test(connectionString)) {
    return NextResponse.json({ error: "connectionString must be a postgres:// or postgresql:// URI." }, { status: 400 });
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
