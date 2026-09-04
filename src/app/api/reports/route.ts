import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultOrgAndUser } from "@/lib/bootstrap";
import { analyzeReportRequest, OrchestratorError } from "@/lib/ai/orchestrator";
import { initialStatusFor } from "@/lib/ai/report-status";
import { runDesignPipeline, DesignPipelineError } from "@/lib/ai/design-pipeline";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const naturalLanguageRequest = body?.request;

  if (typeof naturalLanguageRequest !== "string" || naturalLanguageRequest.trim().length === 0) {
    return NextResponse.json({ error: "Missing 'request' string." }, { status: 400 });
  }

  let plan;
  try {
    plan = await analyzeReportRequest(naturalLanguageRequest);
  } catch (error) {
    if (error instanceof OrchestratorError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("Orchestrator failure:", error);
    return NextResponse.json({ error: "Orchestrator failed unexpectedly." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { orgId, userId } = await ensureDefaultOrgAndUser();

  const { data: report, error: reportInsertError } = await admin
    .from("reports")
    .insert({
      org_id: orgId,
      requested_by: userId,
      title: plan.title,
      natural_language_request: naturalLanguageRequest,
      structured_plan: plan,
      status: initialStatusFor(plan),
      confidence_overall: plan.confidence,
    })
    .select("*")
    .single();

  if (reportInsertError) {
    console.error("Failed to insert report:", reportInsertError);
    return NextResponse.json({ error: "Failed to save report." }, { status: 500 });
  }

  if (plan.attachments.required && plan.attachments.requirements.length > 0) {
    const { error: attachmentInsertError } = await admin.from("attachment_requirements").insert(
      plan.attachments.requirements.map((requirementKey: string) => ({
        org_id: orgId,
        report_id: report.id,
        requirement_key: requirementKey,
        is_required: true,
        status: "pending",
      }))
    );
    if (attachmentInsertError) {
      console.error("Failed to insert attachment requirements:", attachmentInsertError);
    }
  }

  await admin.from("audit_log").insert({
    org_id: orgId,
    report_id: report.id,
    actor_type: "ai",
    action: "orchestrator.plan_generated",
    entity_type: "report",
    entity_id: report.id,
    details: { plan },
  });

  let design = null;
  let designError: string | null = null;
  if (plan.design.required) {
    try {
      const result = await runDesignPipeline(admin, report, plan);
      design = result.design;
    } catch (error) {
      designError = error instanceof DesignPipelineError ? error.message : "Design pipeline failed unexpectedly.";
      console.error("Design pipeline failure:", error);
    }
  }

  const { data: finalReport } = await admin.from("reports").select("*").eq("id", report.id).single();

  return NextResponse.json({ report: finalReport ?? report, plan, design, designError });
}
