import type { OrchestratorPlan } from "./orchestrator-schema";

/**
 * The next pipeline stage a freshly-planned report should wait in.
 * Design/query/attachment pipelines don't exist yet - this just points
 * each report at whichever automated stage will pick it up first.
 */
export function initialStatusFor(plan: OrchestratorPlan): string {
  if (plan.design.required) return "designing";
  if (plan.query.required) return "querying";
  if (plan.attachments.required) return "attachments_pending";
  if (plan.approval.required) return "pending_approval";
  return "generating";
}
