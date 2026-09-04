import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { resolveApproval } from "./approval-pipeline";
import { advanceReportWorkflow } from "./workflow";
import type { OrchestratorPlan } from "./orchestrator-schema";

export class TaskResolutionError extends Error {}

type Decision = "approve" | "reject";

/**
 * Applies a human reviewer's decision to whatever the task is actually
 * about (a design, a query, an attachment, or the whole report's final
 * approval), then closes the task. The automated pipelines already
 * advanced the report past design/query/attachment stages - resolving
 * those only records whether the artifact itself is trustworthy. Approval
 * is different: it's the gate itself, so resolving it can move the report
 * status forward (or fail it) directly.
 */
export async function resolveTask(
  admin: SupabaseClient<Database>,
  taskId: number,
  decision: Decision,
  resolvedBy: string | null
): Promise<void> {
  const { data: task, error: taskError } = await admin
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    throw new TaskResolutionError("Task not found.");
  }
  if (task.status !== "open") {
    throw new TaskResolutionError("Task is already resolved.");
  }

  let plan: OrchestratorPlan | null = null;
  if (task.report_id) {
    const { data: report } = await admin.from("reports").select("*").eq("id", task.report_id).single();
    if (report?.structured_plan) plan = report.structured_plan as unknown as OrchestratorPlan;

    if (task.task_type === "approval" && report && plan) {
      await resolveApproval(admin, report, plan, decision);
    }
  }

  if (task.task_type === "design_review" && task.related_entity_id) {
    await admin
      .from("designs")
      .update({ status: decision === "approve" ? "approved" : "rejected" })
      .eq("id", task.related_entity_id);
  } else if (task.task_type === "query_review" && task.related_entity_id) {
    await admin
      .from("queries")
      .update({ status: decision === "approve" ? "approved" : "rejected" })
      .eq("id", task.related_entity_id);
  } else if (task.task_type === "attachment_review" && task.related_entity_id) {
    const { data: attachment } = await admin
      .from("attachments")
      .select("*")
      .eq("id", task.related_entity_id)
      .single();

    if (attachment) {
      await admin
        .from("attachments")
        .update({ validation_status: decision === "approve" ? "valid" : "invalid" })
        .eq("id", attachment.id);

      if (attachment.requirement_id) {
        await admin
          .from("attachment_requirements")
          .update({ status: decision === "approve" ? "approved" : "requested" })
          .eq("id", attachment.requirement_id);

        if (decision === "reject" && attachment.uploaded_by) {
          await admin.from("notifications").insert({
            org_id: task.org_id,
            user_id: attachment.uploaded_by,
            type: "attachment_rejected",
            message: "A reviewer rejected your uploaded document. Please upload the correct document.",
          });
        }
      }
    }
  } else if (task.task_type !== "approval") {
    throw new TaskResolutionError(`Task type "${task.task_type}" is not reviewable here.`);
  }

  await admin
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", task.id);

  await admin.from("audit_log").insert({
    org_id: task.org_id,
    report_id: task.report_id,
    actor_type: "user",
    actor_id: resolvedBy,
    action: decision === "approve" ? "task.approved_by_human" : "task.rejected_by_human",
    entity_type: task.related_entity_type,
    entity_id: task.related_entity_id,
    details: { task_id: task.id, task_type: task.task_type },
  });

  if (task.report_id && plan) {
    const { data: report } = await admin.from("reports").select("*").eq("id", task.report_id).single();
    if (report) {
      try {
        await advanceReportWorkflow(admin, report, plan);
      } catch (error) {
        console.error("Report workflow advancement failure after task resolution:", error);
      }
    }
  }
}
