import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { runReportPipeline, ReportPipelineError } from "@/lib/ai/run-report-pipeline";

export async function GET() {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();

  const { data: reports, error } = await admin
    .from("reports")
    .select("id, title, natural_language_request, status, confidence_overall, created_at, updated_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Failed to load reports." }, { status: 500 });
  }

  const reportIds = reports.map((r) => r.id);
  const { data: exports } = reportIds.length
    ? await admin.from("report_exports").select("report_id, format").in("report_id", reportIds)
    : { data: [] };

  const formatsByReport = new Map<number, string[]>();
  for (const exp of exports ?? []) {
    const list = formatsByReport.get(exp.report_id) ?? [];
    list.push(exp.format);
    formatsByReport.set(exp.report_id, list);
  }

  const enriched = reports.map((report) => ({
    ...report,
    exportFormats: formatsByReport.get(report.id) ?? [],
  }));

  return NextResponse.json({ reports: enriched });
}

const VALID_FORMATS = ["pdf", "excel"] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const naturalLanguageRequest = body?.request;

  if (typeof naturalLanguageRequest !== "string" || naturalLanguageRequest.trim().length === 0) {
    return NextResponse.json({ error: "Missing 'request' string." }, { status: 400 });
  }

  const requestedFormats = Array.isArray(body?.exportFormats)
    ? body.exportFormats.filter((f: unknown): f is "pdf" | "excel" => VALID_FORMATS.includes(f as never))
    : undefined;

  let orgId: number, userId: string;
  try {
    ({ orgId, userId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();

  try {
    const result = await runReportPipeline(admin, orgId, userId, naturalLanguageRequest, requestedFormats);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReportPipelineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Report pipeline failure:", error);
    return NextResponse.json({ error: "Report pipeline failed unexpectedly." }, { status: 500 });
  }
}
