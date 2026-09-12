import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { data: designs, error } = await admin
    .from("designs")
    .select("id, report_id, confidence, components, created_at")
    .eq("org_id", orgId)
    .in("status", ["approved", "auto_approved"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "Failed to load approved designs." }, { status: 500 });

  const reportIds = [...new Set((designs ?? []).map((d) => d.report_id))];
  const { data: reports } = reportIds.length
    ? await admin.from("reports").select("id, title, natural_language_request").in("id", reportIds)
    : { data: [] };
  const titleByReportId = new Map((reports ?? []).map((r) => [r.id, r.title ?? r.natural_language_request]));

  const enriched = (designs ?? []).map((d) => ({
    id: d.id,
    reportId: d.report_id,
    reportTitle: titleByReportId.get(d.report_id) ?? `Report #${d.report_id}`,
    confidence: d.confidence,
    componentCount: Array.isArray(d.components) ? d.components.length : 0,
    createdAt: d.created_at,
  }));

  return NextResponse.json({ designs: enriched });
}
