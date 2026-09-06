import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { analyzeReportRequest, OrchestratorError } from "./orchestrator";
import { initialStatusFor } from "./report-status";
import { runDesignPipeline, DesignPipelineError } from "./design-pipeline";
import { runQueryPipeline, QueryPipelineError } from "./query-pipeline";
import { requestMissingAttachments } from "./attachment-pipeline";
import { advanceReportWorkflow } from "./workflow";

export class ReportPipelineError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/**
 * Runs a natural-language request all the way through the orchestrator,
 * design, query, and workflow-advancement pipelines. Shared by the manual
 * "new report" API route and the schedule cron job so both produce
 * identical results for the same request text.
 */
export async function runReportPipeline(
  admin: SupabaseClient<Database>,
  orgId: number,
  userId: string,
  naturalLanguageRequest: string
) {
  let plan;
  try {
    plan = await analyzeReportRequest(naturalLanguageRequest);
  } catch (error) {
    if (error instanceof OrchestratorError) {
      throw new ReportPipelineError(error.message, 422);
    }
    throw new ReportPipelineError("Orchestrator failed unexpectedly.", 500);
  }

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

  if (reportInsertError || !report) {
    throw new ReportPipelineError("Failed to save report.", 500);
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
    if (!attachmentInsertError) {
      try {
        await requestMissingAttachments(admin, report);
      } catch (error) {
        console.error("Attachment pipeline failure:", error);
      }
    } else {
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

  let query = null;
  let queryError: string | null = null;
  if (plan.query.required) {
    try {
      const result = await runQueryPipeline(admin, report, plan);
      query = result.query;
    } catch (error) {
      queryError = error instanceof QueryPipelineError ? error.message : "Query pipeline failed unexpectedly.";
      console.error("Query pipeline failure:", error);
    }
  }

  const { data: reportAfterPipelines } = await admin.from("reports").select("*").eq("id", report.id).single();

  try {
    if (reportAfterPipelines) {
      await advanceReportWorkflow(admin, reportAfterPipelines, plan);
    }
  } catch (error) {
    console.error("Report workflow advancement failure:", error);
  }

  const { data: finalReport } = await admin.from("reports").select("*").eq("id", report.id).single();
  const { data: attachmentRequirements } = await admin
    .from("attachment_requirements")
    .select("*")
    .eq("report_id", report.id);

  const { data: exports } = await admin.from("report_exports").select("*").eq("report_id", report.id);
  const exportsWithUrls = await Promise.all(
    (exports ?? []).map(async (exp) => {
      if (!exp.storage_path) return { ...exp, url: null };
      const { data } = await admin.storage.from("report-exports").createSignedUrl(exp.storage_path, 3600);
      return { ...exp, url: data?.signedUrl ?? null };
    })
  );

  return {
    report: finalReport ?? report,
    plan,
    design,
    designError,
    query,
    queryError,
    attachmentRequirements: attachmentRequirements ?? [],
    exports: exportsWithUrls,
  };
}
