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

/** Original generation + up to this many auto-regenerations after human rejection, before we stop and leave it for a manual "Regenerate" click. */
export const MAX_AUTO_DESIGN_VERSIONS = 4;

export type DesignPipelineResult = {
  design: Database["public"]["Tables"]["designs"]["Row"];
  escalated: boolean;
};
type Report = Database["public"]["Tables"]["reports"]["Row"];

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

/** Generates, QAs, and saves one new design version (does not touch reports.status). */
async function buildAndInsertDesign(
  admin: SupabaseClient<Database>,
  report: Report,
  version: number
): Promise<DesignPipelineResult> {
  const title = report.title ?? report.natural_language_request;

  let design: DesignPlan;
  try {
    design = await generateDesign(title, report.natural_language_request);
  } catch (error) {
    throw new DesignPipelineError(error instanceof AiToolCallError ? error.message : String(error));
  }

  let issues = runDesignQa(design);
  const generatedBy = "ai" as const;

  if (issues.length > 0) {
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "ai",
      action: "design.qa_issues_found",
      entity_type: "report",
      entity_id: report.id,
      details: { issues, version },
    });

    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS && issues.length > 0; attempt++) {
      try {
        design = await fixDesign(title, report.natural_language_request, design, issues);
      } catch (error) {
        throw new DesignPipelineError(error instanceof AiToolCallError ? error.message : String(error));
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
      details: { remaining_issues: issues, version },
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
      version,
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
      details: { confidence: design.confidence, threshold, remaining_issues: issues, version },
    });
  } else {
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "ai",
      action: "design.auto_approved",
      entity_type: "design",
      entity_id: designRow.id,
      details: { confidence: design.confidence, threshold, version },
    });
  }

  return { design: designRow, escalated };
}

export async function runDesignPipeline(
  admin: SupabaseClient<Database>,
  report: Report,
  plan: OrchestratorPlan
): Promise<DesignPipelineResult> {
  const result = await buildAndInsertDesign(admin, report, 1);

  await admin.from("reports").update({ status: statusAfterDesign(plan) }).eq("id", report.id);

  return result;
}

/**
 * Generates a new design version for a report that already has one -
 * called automatically when a human rejects a design (see
 * task-resolution.ts) and available as a manual "Regenerate" action.
 * Deliberately never touches reports.status: by the time a design gets
 * rejected the report has typically already moved well past the
 * "designing" stage (design review is advisory, not gating - see
 * task-resolution.ts's module comment), so re-running the status
 * transition here could incorrectly rewind an already-advanced report.
 */
export async function regenerateDesign(
  admin: SupabaseClient<Database>,
  report: Report,
  reason: "auto_rejection" | "manual"
): Promise<DesignPipelineResult | null> {
  const { data: existing } = await admin
    .from("designs")
    .select("id, version, status")
    .eq("report_id", report.id)
    .order("version", { ascending: false });

  const versions = existing ?? [];
  const latest = versions[0] as { id: number; version: number; status: string } | undefined;
  const nextVersion = (latest?.version ?? 0) + 1;

  if (reason === "auto_rejection" && nextVersion > MAX_AUTO_DESIGN_VERSIONS) {
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "system",
      action: "design.regeneration_limit_reached",
      entity_type: "report",
      entity_id: report.id,
      details: { versions_tried: versions.length },
    });
    return null;
  }

  // A version that was never decided is being replaced before anyone acted on it - mark it superseded.
  // A version that was explicitly rejected or approved keeps that status as the historical record.
  if (latest && latest.status === "pending_review") {
    await admin.from("designs").update({ status: "superseded" }).eq("id", latest.id);
  }

  const result = await buildAndInsertDesign(admin, report, nextVersion);

  await admin.from("audit_log").insert({
    org_id: report.org_id,
    report_id: report.id,
    actor_type: reason === "auto_rejection" ? "system" : "user",
    action: "design.regenerated",
    entity_type: "design",
    entity_id: result.design.id,
    details: { reason, version: nextVersion },
  });

  return result;
}

/**
 * Instantly clones a previously-approved design (from any report in the
 * org) onto a new report, with no AI call - the whole point of "reuse an
 * approved design" is that it's fast and exactly reproduces something a
 * human already vetted.
 */
export async function cloneApprovedDesign(
  admin: SupabaseClient<Database>,
  report: Report,
  sourceDesignId: number
): Promise<Database["public"]["Tables"]["designs"]["Row"]> {
  const { data: source, error } = await admin
    .from("designs")
    .select("*")
    .eq("id", sourceDesignId)
    .eq("org_id", report.org_id)
    .in("status", ["approved", "auto_approved"])
    .maybeSingle();

  if (error || !source) {
    throw new DesignPipelineError("That design wasn't found, or isn't approved.");
  }

  const { data: designRow, error: insertError } = await admin
    .from("designs")
    .insert({
      org_id: report.org_id,
      report_id: report.id,
      version: 1,
      layout: source.layout,
      components: source.components,
      style: source.style,
      confidence: source.confidence,
      status: "auto_approved",
      generated_by: "ai",
      qa_issues: [],
    })
    .select("*")
    .single();

  if (insertError || !designRow) {
    throw new DesignPipelineError("Failed to clone the design.");
  }

  await admin.from("audit_log").insert({
    org_id: report.org_id,
    report_id: report.id,
    actor_type: "user",
    action: "design.reused_from_report",
    entity_type: "design",
    entity_id: designRow.id,
    details: { source_design_id: sourceDesignId, source_report_id: source.report_id },
  });

  return designRow;
}
