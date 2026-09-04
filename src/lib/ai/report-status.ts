import type { OrchestratorPlan } from "./orchestrator-schema";

type Stage = "design" | "query" | "attachments" | "approval";

const STAGE_ORDER: Stage[] = ["design", "query", "attachments", "approval"];

const STAGE_STATUS: Record<Stage, string> = {
  design: "designing",
  query: "querying",
  attachments: "attachments_pending",
  approval: "pending_approval",
};

function isRequired(plan: OrchestratorPlan, stage: Stage): boolean {
  if (stage === "design") return plan.design.required;
  if (stage === "query") return plan.query.required;
  if (stage === "attachments") return plan.attachments.required;
  return plan.approval.required;
}

/**
 * The next pipeline stage a report should wait in, given which stages are
 * required by the plan and which stage (if any) was just completed.
 * Falls through to "generating" once every required stage is done.
 */
function nextStatus(plan: OrchestratorPlan, completedStage: Stage | null): string {
  const startIndex = completedStage ? STAGE_ORDER.indexOf(completedStage) + 1 : 0;
  for (let i = startIndex; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    if (isRequired(plan, stage)) return STAGE_STATUS[stage];
  }
  return "generating";
}

export function initialStatusFor(plan: OrchestratorPlan): string {
  return nextStatus(plan, null);
}

export function statusAfterDesign(plan: OrchestratorPlan): string {
  return nextStatus(plan, "design");
}

export function statusAfterQuery(plan: OrchestratorPlan): string {
  return nextStatus(plan, "query");
}

export function statusAfterAttachments(plan: OrchestratorPlan): string {
  return nextStatus(plan, "attachments");
}

export function statusAfterApproval(plan: OrchestratorPlan): string {
  return nextStatus(plan, "approval");
}
