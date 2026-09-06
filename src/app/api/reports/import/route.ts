import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { parseUploadedFile, createImportedDataSource, FileImportError } from "@/lib/ai/file-import";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file'." }, { status: 400 });
  }
  if (!/\.(csv|xlsx)$/i.test(file.name)) {
    return NextResponse.json({ error: "Only .csv and .xlsx files are supported." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 5MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseUploadedFile(buffer, file.name);
  } catch (error) {
    const message = error instanceof FileImportError ? error.message : "Could not read that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const name = file.name.replace(/\.(csv|xlsx)$/i, "");

  let result;
  try {
    result = await createImportedDataSource(orgId, name, parsed);
  } catch (error) {
    const message = error instanceof FileImportError ? error.message : "Could not load the file's data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: dataSource, error: insertError } = await admin
    .from("data_sources")
    .insert({
      org_id: orgId,
      name: `Uploaded: ${name}`,
      kind: "upload",
      connection_ref: "upload",
      schema_cache: { tables: result.tables },
    })
    .select("id, name")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "File was loaded but could not be registered as a data source." }, { status: 500 });
  }

  return NextResponse.json({
    dataSource,
    rowCount: parsed.rows.length,
    columns: parsed.columns,
  });
}
