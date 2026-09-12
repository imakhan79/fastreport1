import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { regenerateRejectedQuery, QueryPipelineError } from "@/lib/ai/query-pipeline";
import { advanceReportWorkflow } from "@/lib/ai/workflow";
import type { OrchestratorPlan } from "@/lib/ai/orchestrator-schema";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });

  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  const { data: report, error } = await admin.from("reports").select("*").eq("id", reportId).eq("org_id", orgId).maybeSingle();
  if (error || !report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  try {
    const result = await regenerateRejectedQuery(admin, report, "manual");
    if (!result) {
      return NextResponse.json({ error: "This report has hit its automatic regeneration limit already." }, { status: 400 });
    }

    if (report.structured_plan) {
      try {
        await advanceReportWorkflow(admin, report, report.structured_plan as unknown as OrchestratorPlan);
      } catch (workflowError) {
        console.error("Workflow advancement failed after manual query regeneration:", workflowError);
      }
    }

    return NextResponse.json({ query: result.query, escalated: result.escalated });
  } catch (err) {
    const message = err instanceof QueryPipelineError ? err.message : "Failed to regenerate the query.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
