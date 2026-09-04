import { callGeminiTool, AiToolCallError } from "./call-tool";
import {
  ORCHESTRATOR_PLAN_TOOL_SCHEMA,
  OrchestratorPlanSchema,
  type OrchestratorPlan,
} from "./orchestrator-schema";

/**
 * Confidence below this means "don't trust the orchestrator's own read of
 * the request" -> the caller should route the report to human review
 * instead of letting downstream pipelines run on it.
 */
export const ORCHESTRATION_CONFIDENCE_THRESHOLD = 85;

const SYSTEM_PROMPT = `You are the AI Orchestrator for DataReportQ, an autonomous reporting platform.

Your only job: read a user's natural-language report request and produce a structured execution plan by calling the submit_plan function. You do not generate the report yourself - later automated pipelines (design, query, attachment) read your plan and do that work.

Rules:
- design.required is true unless the user is asking for a trivial re-export of an existing report with no new visualization needs.
- query.required is true whenever the report needs any data pulled from a database (almost always true for anything with numbers, trends, or comparisons).
- design.mode and query.mode should be "automatic" unless the request explicitly demands something a human must design/write by hand (e.g. "let me review the query before it runs" or a legally-sensitive custom layout).
- attachments.requirements should list short snake_case requirement keys (e.g. "approved_sales_summary", "signed_invoice") for any supporting documents the request implies are needed - infer this the way a competent analyst would (e.g. "expense report" implies receipts and an approval document). Leave the array empty if nothing is implied.
- approval.required is true for anything distributed outside the requester (e.g. sent to management, emailed to a distribution list) or described as final/official.
- distribution.required and distribution.channel reflect whether the user explicitly asked the report to be sent somewhere (e.g. "email it to management" -> required: true, channel: "email"). If the user didn't mention distribution, required is false and channel is "none".
- confidence is your 0-100 confidence that this plan correctly captures what the user wants. Be honest - a vague or ambiguous request should score lower, not be padded to look confident.
- report_type is a stable snake_case key that would apply to similar future requests (e.g. "monthly_sales_comparison"), not a one-off description of this exact request.`;

export class OrchestratorError extends Error {}

export async function analyzeReportRequest(
  naturalLanguageRequest: string
): Promise<OrchestratorPlan> {
  try {
    return await callGeminiTool({
      systemInstruction: SYSTEM_PROMPT,
      input: naturalLanguageRequest,
      toolName: "submit_plan",
      toolDescription: "Submit the structured execution plan for this report request.",
      toolParameters: ORCHESTRATOR_PLAN_TOOL_SCHEMA,
      schema: OrchestratorPlanSchema,
    });
  } catch (error) {
    if (error instanceof AiToolCallError) {
      throw new OrchestratorError(error.message);
    }
    throw error;
  }
}

export type { OrchestratorPlan };
