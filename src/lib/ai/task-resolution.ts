import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

export class TaskResolutionError extends Error {}

type Decision = "approve" | "reject";

/**
 * Applies a human reviewer's decision to whatever the task is actually
 * about (a design, a query, or an attachment), then closes the task.
 * The automated pipelines already advanced the report past these stages -
 * this only records whether the artifact itself is trustworthy.
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
  } else {
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
}
