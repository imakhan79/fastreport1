import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

const VALID_FORMATS = ["pdf", "excel"] as const;

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
    .from("report_templates")
    .select("id, name, description, natural_language_request, export_formats, updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to load templates." }, { status: 500 });

  return NextResponse.json({ templates: data ?? [] });
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
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const naturalLanguageRequest = typeof body?.naturalLanguageRequest === "string" ? body.naturalLanguageRequest.trim() : "";
  const exportFormats = Array.isArray(body?.exportFormats)
    ? body.exportFormats.filter((f: unknown): f is "pdf" | "excel" => VALID_FORMATS.includes(f as never))
    : ["pdf", "excel"];

  if (!name || !naturalLanguageRequest) {
    return NextResponse.json({ error: "Missing name or naturalLanguageRequest." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("report_templates")
    .insert({
      org_id: orgId,
      created_by: userId,
      name,
      description,
      natural_language_request: naturalLanguageRequest,
      export_formats: exportFormats.length > 0 ? exportFormats : ["pdf", "excel"],
    })
    .select("id, name, description, natural_language_request, export_formats, updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to save template." }, { status: 500 });

  return NextResponse.json({ template: data });
}
