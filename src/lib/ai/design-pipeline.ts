import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { callGeminiTool, AiToolCallError } from "./call-tool";
import { DESIGN_PLAN_TOOL_SCHEMA, DesignPlanSchema, type DesignPlan } from "./design-schema";
import { runDesignQa } from "./design-qa";
import { getConfidenceThreshold } from "./confidence";
import { statusAfterDesign } from "./report-status";
import type { OrchestratorPlan } from "./orchestrator-schema";

const SYSTEM_PROMPT = `You are the Design pipeline of DataReportQ, an autonomous reporting platform.

Given a report's title and the user's original request, produce a complete report design by calling submit_design: a section layout, the components that fill it (charts/tables/KPIs/text), a data binding for each component, and a style. Every component must belong to a section that exists in layout.sections, and every section must have at least one component. Be concrete: pick real chart types and real metric/dimension names implied by the request, not placeholders.

confidence is your honest 0-100 confidence that this design correctly serves the request - lower it for vague requests or requests with layout requirements you're unsure how to satisfy.`;

const MAX_FIX_ATTEMPTS = 1;

export type DesignPipelineResult = {
  design: Database["public"]["Tables"]["designs"]["Row"];
  escalated: boolean;
};

export class DesignPipelineError extends Error {}

async function generateDesign(reportTitle: string, request: string): Promise<DesignPlan> {
  return callGeminiTool({
    systemInstruction: SYSTEM_PROMPT,
    input: `Report title: ${reportTitle}\n\nOriginal request: ${request}`,
    toolName: "submit_design",
    toolDescription: "Submit the complete report design.",
    toolParameters: DESIGN_PLAN_TOOL_SCHEMA,
    schema: DesignPlanSchema,
  });
}

async function fixDesign(
  reportTitle: string,
  request: string,
  previousDesign: DesignPlan,
  issues: string[]
): Promise<DesignPlan> {
  return callGeminiTool({
    systemInstruction: SYSTEM_PROMPT,
    input: `Report title: ${reportTitle}\n\nOriginal request: ${request}\n\nYour previous design had these QA issues:\n${issues
      .map((i) => `- ${i}`)
      .join("\n")}\n\nPrevious design:\n${JSON.stringify(previousDesign)}\n\nSubmit a corrected design that fixes every issue listed above.`,
    toolName: "submit_design",
    toolDescription: "Submit the corrected report design.",
    toolParameters: DESIGN_PLAN_TOOL_SCHEMA,
    schema: DesignPlanSchema,
  });
}

export async function runDesignPipeline(
  admin: SupabaseClient<Database>,
  report: Database["public"]["Tables"]["reports"]["Row"],
  plan: OrchestratorPlan
): Promise<DesignPipelineResult> {
  const title = report.title ?? report.natural_language_request;

  let design: DesignPlan;
  try {
    design = await generateDesign(title, report.natural_language_request);
  } catch (error) {
    throw new DesignPipelineError(
      error instanceof AiToolCallError ? error.message : String(error)
    );
  }

  let issues = runDesignQa(design);
  let generatedBy: "ai" = "ai";

  if (issues.length > 0) {
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "ai",
      action: "design.qa_issues_found",
      entity_type: "report",
      entity_id: report.id,
      details: { issues },
    });

    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS && issues.length > 0; attempt++) {
      try {
        design = await fixDesign(title, report.natural_language_request, design, issues);
      } catch (error) {
        throw new DesignPipelineError(
          error instanceof AiToolCallError ? error.message : String(error)
        );
      }
      issues = runDesignQa(design);
    }

    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "ai",
      action: issues.length === 0 ? "design.auto_fixed" : "design.auto_fix_failed",
      entity_type: "report",
      entity_id: report.id,
      details: { remaining_issues: issues },
    });
  }

  const threshold = await getConfidenceThreshold(admin, report.org_id, "design");
  const passesQa = issues.length === 0;
  const passesConfidence = design.confidence >= threshold;
  const escalated = !passesQa || !passesConfidence;

  const { data: designRow, error: designInsertError } = await admin
    .from("designs")
    .insert({
      org_id: report.org_id,
      report_id: report.id,
      layout: design.layout,
      components: design.components,
      style: design.style,
      confidence: design.confidence,
      status: escalated ? "pending_review" : "auto_approved",
      generated_by: generatedBy,
      qa_issues: issues,
    })
    .select("*")
    .single();

  if (designInsertError) {
    throw new DesignPipelineError(`Failed to save design: ${designInsertError.message}`);
  }

  if (escalated) {
    await admin.from("tasks").insert({
      org_id: report.org_id,
      report_id: report.id,
      task_type: "design_review",
      related_entity_type: "design",
      related_entity_id: designRow.id,
      priority: "normal",
      status: "open",
      confidence: design.confidence,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "system",
      action: "design.escalated_for_review",
      entity_type: "design",
      entity_id: designRow.id,
      details: { confidence: design.confidence, threshold, remaining_issues: issues },
    });
  } else {
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "ai",
      action: "design.auto_approved",
      entity_type: "design",
      entity_id: designRow.id,
      details: { confidence: design.confidence, threshold },
    });
  }

  await admin
    .from("reports")
    .update({ status: statusAfterDesign(plan) })
    .eq("id", report.id);

  return { design: designRow, escalated };
}
