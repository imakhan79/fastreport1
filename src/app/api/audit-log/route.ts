import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();

  const reportIdParam = req.nextUrl.searchParams.get("reportId");
  const reportId = reportIdParam ? Number(reportIdParam) : null;
  if (reportIdParam && !Number.isInteger(reportId)) {
    return NextResponse.json({ error: "Invalid reportId." }, { status: 400 });
  }

  let query = admin
    .from("audit_log")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(150);

  if (reportId) {
    query = query.eq("report_id", reportId);
  }

  const { data: entries, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load audit log." }, { status: 500 });
  }

  const reportIds = [...new Set(entries.map((e) => e.report_id).filter((id): id is number => id !== null))];
  const { data: reports } = reportIds.length
    ? await admin.from("reports").select("id, title, natural_language_request").in("id", reportIds)
    : { data: [] };
  const reportsById = new Map((reports ?? []).map((r) => [r.id, r]));

  const enriched = entries.map((entry) => ({
    ...entry,
    report: entry.report_id ? reportsById.get(entry.report_id) ?? null : null,
  }));

  return NextResponse.json({ entries: enriched });
}
