import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

const VALID_FORMATS = ["pdf", "excel"] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const templateId = Number(id);
  if (!Number.isInteger(templateId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const naturalLanguageRequest = typeof body?.naturalLanguageRequest === "string" ? body.naturalLanguageRequest.trim() : "";
  const exportFormats = Array.isArray(body?.exportFormats)
    ? body.exportFormats.filter((f: unknown): f is "pdf" | "excel" => VALID_FORMATS.includes(f as never))
    : undefined;

  if (!name || !naturalLanguageRequest) {
    return NextResponse.json({ error: "Missing name or naturalLanguageRequest." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("report_templates")
    .update({
      name,
      description,
      natural_language_request: naturalLanguageRequest,
      ...(exportFormats && exportFormats.length > 0 ? { export_formats: exportFormats } : {}),
    })
    .eq("id", templateId)
    .eq("org_id", orgId)
    .select("id, name, description, natural_language_request, export_formats, updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to update template." }, { status: 500 });

  return NextResponse.json({ template: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const templateId = Number(id);
  if (!Number.isInteger(templateId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("report_templates").delete().eq("id", templateId).eq("org_id", orgId);

  if (error) return NextResponse.json({ error: "Failed to delete template." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
