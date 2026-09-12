import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { fetchRestApiData, syncRestApiTable, RestConnectorError, type RestConnectorConfig, type RestConnectorSecret } from "@/lib/ai/rest-connector";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dataSourceId = Number(id);
  if (!Number.isInteger(dataSourceId)) return NextResponse.json({ error: "Invalid data source id." }, { status: 400 });

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

  if (fetchError || !dataSource) return NextResponse.json({ error: "Data source not found." }, { status: 404 });
  if (dataSource.kind !== "rest_api" || !dataSource.synced_table_name) {
    return NextResponse.json({ error: "This data source is not a REST API connector." }, { status: 400 });
  }

  const config = dataSource.connector_config as RestConnectorConfig;
  const secret = (dataSource.connector_secret as RestConnectorSecret) ?? {};

  let parsed;
  try {
    parsed = await fetchRestApiData(config, secret);
  } catch (error) {
    const message = error instanceof RestConnectorError ? error.message : "Could not fetch that API.";
    await admin.from("data_sources").update({ sync_error: message }).eq("id", dataSourceId);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await syncRestApiTable(orgId, dataSource.synced_table_name, parsed);
  } catch (error) {
    const message = error instanceof RestConnectorError ? error.message : "Could not load the API's data.";
    await admin.from("data_sources").update({ sync_error: message }).eq("id", dataSourceId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("data_sources")
    .update({
      schema_cache: { tables: [{ name: dataSource.synced_table_name, columns: parsed.columns.map((c) => ({ name: c, type: "text" })) }] },
      last_synced_at: new Date().toISOString(),
      sync_error: null,
    })
    .eq("id", dataSourceId);

  if (updateError) return NextResponse.json({ error: "Synced, but failed to save the updated schema." }, { status: 500 });

  return NextResponse.json({ rowCount: parsed.rows.length, columns: parsed.columns });
}
