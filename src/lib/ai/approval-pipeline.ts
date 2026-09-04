import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { pickResponsibleUser } from "./assignment";
import { statusAfterApproval } from "./report-status";
import type { OrchestratorPlan } from "./orchestrator-schema";

const DEADLINE_HOURS = 24;

type Report = Database["public"]["Tables"]["reports"]["Row"];

/**
 * Section 5/18: approval is a human decision gate before a report is
 * considered final ("approval.required is true for anything distributed
 * outside the requester"). No task is created manually - once the report
 * has nothing else pending and lands in pending_approval, this creates
 * the approval task automatically, exactly like every other pipeline.
 */
export async function requestApprovalIfNeeded(
  admin: SupabaseClient<Database>,
  report: Report
): Promise<void> {
  if (report.status !== "pending_approval") return;

  const { data: existingTask } = await admin
    .from("tasks")
    .select("id")
    .eq("report_id", report.id)
    .eq("task_type", "approval")
    .eq("status", "open")
    .maybeSingle();
  if (existingTask) return;

  const responsibleUserId = await pickResponsibleUser(admin, report.org_id);
  const deadline = new Date(Date.now() + DEADLINE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: task } = await admin
    .from("tasks")
    .insert({
      org_id: report.org_id,
      report_id: report.id,
      task_type: "approval",
      related_entity_type: "report",
      related_entity_id: report.id,
      assigned_to: responsibleUserId,
      priority: "normal",
      status: "open",
      confidence: report.confidence_overall,
      deadline,
    })
    .select("*")
    .single();

  if (responsibleUserId) {
    await admin.from("notifications").insert({
      org_id: report.org_id,
      user_id: responsibleUserId,
      task_id: task?.id ?? null,
      type: "approval_request",
      message: `"${report.title ?? report.natural_language_request}" is ready and needs your approval before it can be finalized.`,
    });
  }

  await admin.from("audit_log").insert({
    org_id: report.org_id,
    report_id: report.id,
    actor_type: "system",
    action: "approval.request_created",
    entity_type: "report",
    entity_id: report.id,
    details: { assigned_to: responsibleUserId, deadline },
  });
}

/** Applies a human's approval/rejection decision on a whole report. */
export async function resolveApproval(
  admin: SupabaseClient<Database>,
  report: Report,
  plan: OrchestratorPlan,
  decision: "approve" | "reject"
): Promise<void> {
  if (decision === "reject") {
    await admin.from("reports").update({ status: "failed" }).eq("id", report.id);
    await admin.from("notifications").insert({
      org_id: report.org_id,
      user_id: report.requested_by,
      type: "report_rejected",
      message: `"${report.title ?? report.natural_language_request}" was rejected during approval and will not be generated.`,
    });
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "user",
      action: "report.rejected_at_approval",
      entity_type: "report",
      entity_id: report.id,
      details: {},
    });
    return;
  }

  await admin.from("reports").update({ status: statusAfterApproval(plan) }).eq("id", report.id);
  await admin.from("audit_log").insert({
    org_id: report.org_id,
    report_id: report.id,
    actor_type: "user",
    action: "report.approved",
    entity_type: "report",
    entity_id: report.id,
    details: {},
  });
}
