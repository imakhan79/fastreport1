import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { callGeminiTool, AiToolCallError } from "./call-tool";
import {
  ATTACHMENT_CLASSIFICATION_TOOL_SCHEMA,
  AttachmentClassificationSchema,
  type AttachmentClassification,
} from "./attachment-schema";
import { getConfidenceThreshold } from "./confidence";
import { advanceReportWorkflow } from "./workflow";
import { pickResponsibleUser } from "./assignment";
import type { OrchestratorPlan } from "./orchestrator-schema";

const DEADLINE_HOURS = 24;

/**
 * Section 3/4 of the spec: for every attachment requirement a report needs,
 * check whether it's already satisfied (an upload already exists for this
 * exact requirement - handles re-running the pipeline), and if not,
 * automatically create the request, assign it, and notify - no manual
 * attachment task creation.
 */
export async function requestMissingAttachments(
  admin: SupabaseClient<Database>,
  report: Database["public"]["Tables"]["reports"]["Row"]
): Promise<void> {
  const { data: requirements } = await admin
    .from("attachment_requirements")
    .select("*")
    .eq("report_id", report.id)
    .eq("status", "pending");

  if (!requirements || requirements.length === 0) return;

  const responsibleUserId = await pickResponsibleUser(admin, report.org_id);

  for (const requirement of requirements) {
    const { data: existing } = await admin
      .from("attachments")
      .select("*")
      .eq("requirement_id", requirement.id)
      .eq("validation_status", "valid")
      .limit(1)
      .maybeSingle();

    if (existing) {
      await admin.from("attachment_requirements").update({ status: "approved" }).eq("id", requirement.id);
      await admin.from("audit_log").insert({
        org_id: report.org_id,
        report_id: report.id,
        actor_type: "system",
        action: "attachment.existing_document_matched",
        entity_type: "attachment_requirement",
        entity_id: requirement.id,
        details: { requirement_key: requirement.requirement_key, attachment_id: existing.id },
      });
      continue;
    }

    const deadline = new Date(Date.now() + DEADLINE_HOURS * 60 * 60 * 1000).toISOString();

    const { data: task } = await admin
      .from("tasks")
      .insert({
        org_id: report.org_id,
        report_id: report.id,
        task_type: "attachment_request",
        related_entity_type: "attachment_requirement",
        related_entity_id: requirement.id,
        assigned_to: responsibleUserId,
        priority: "normal",
        status: "open",
        deadline,
      })
      .select("*")
      .single();

    if (responsibleUserId) {
      await admin.from("notifications").insert({
        org_id: report.org_id,
        user_id: responsibleUserId,
        task_id: task?.id ?? null,
        type: "attachment_request",
        message: `"${requirement.requirement_key}" is needed for report "${report.title ?? report.natural_language_request}" - please upload by ${new Date(deadline).toLocaleString()}.`,
      });
    }

    await admin
      .from("attachment_requirements")
      .update({ status: "requested" })
      .eq("id", requirement.id);

    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "system",
      action: "attachment.request_created",
      entity_type: "attachment_requirement",
      entity_id: requirement.id,
      details: { requirement_key: requirement.requirement_key, assigned_to: responsibleUserId, deadline },
    });
  }
}

const CLASSIFICATION_SYSTEM_PROMPT = `You are the Attachment pipeline of DataReportQ, an autonomous reporting platform.

You will be shown a document and a required document type. Classify what the document actually is, and judge whether it satisfies the requirement. Call submit_classification with your judgment.

confidence is your honest 0-100 confidence in this judgment - lower it if the document is unclear, low quality, or ambiguous.`;

function contentPartForFile(mimeType: string, base64Data: string) {
  if (mimeType.startsWith("image/")) {
    return { type: "image" as const, data: base64Data, mime_type: mimeType };
  }
  return { type: "document" as const, data: base64Data, mime_type: mimeType };
}

async function classifyAttachment(
  fileBuffer: Buffer,
  mimeType: string,
  requirementKey: string,
  requirementDescription: string | null
): Promise<AttachmentClassification> {
  const filePart = contentPartForFile(mimeType, fileBuffer.toString("base64"));
  const promptText = `Required document type: ${requirementKey}${
    requirementDescription ? `\nDescription: ${requirementDescription}` : ""
  }\n\nDoes the attached document satisfy this requirement?`;

  try {
    return await callGeminiTool({
      systemInstruction: CLASSIFICATION_SYSTEM_PROMPT,
      input: [filePart, { type: "text", text: promptText }],
      toolName: "submit_classification",
      toolDescription: "Submit the document classification and requirement match judgment.",
      toolParameters: ATTACHMENT_CLASSIFICATION_TOOL_SCHEMA,
      schema: AttachmentClassificationSchema,
    });
  } catch (error) {
    throw new AttachmentPipelineError(
      error instanceof AiToolCallError ? error.message : String(error)
    );
  }
}

export class AttachmentPipelineError extends Error {}

export type AttachmentUploadResult = {
  attachment: Database["public"]["Tables"]["attachments"]["Row"];
  classification: AttachmentClassification;
  decision: "approved" | "rejected" | "escalated";
};

/**
 * Sections 3/4/11: an uploaded document is validated, classified, and
 * matched against its requirement. High-confidence matches auto-approve;
 * high-confidence mismatches automatically request a replacement; anything
 * uncertain escalates to a human review task instead of guessing.
 */
export async function processAttachmentUpload(
  admin: SupabaseClient<Database>,
  requirementId: number,
  fileBuffer: Buffer,
  mimeType: string,
  storagePath: string,
  uploadedBy: string | null,
  orgId: number
): Promise<AttachmentUploadResult> {
  const { data: requirement, error: requirementError } = await admin
    .from("attachment_requirements")
    .select("*")
    .eq("id", requirementId)
    .eq("org_id", orgId)
    .single();

  if (requirementError || !requirement) {
    throw new AttachmentPipelineError("Attachment requirement not found.");
  }

  const { data: attachment, error: attachmentInsertError } = await admin
    .from("attachments")
    .insert({
      org_id: requirement.org_id,
      requirement_id: requirement.id,
      storage_path: storagePath,
      uploaded_by: uploadedBy,
      validation_status: "pending",
    })
    .select("*")
    .single();

  if (attachmentInsertError || !attachment) {
    throw new AttachmentPipelineError(`Failed to save attachment: ${attachmentInsertError?.message}`);
  }

  await admin
    .from("attachment_requirements")
    .update({ status: "uploaded" })
    .eq("id", requirement.id);

  const classification = await classifyAttachment(
    fileBuffer,
    mimeType,
    requirement.requirement_key,
    requirement.description
  );

  const threshold = await getConfidenceThreshold(admin, requirement.org_id, "attachment_match");
  const confident = classification.confidence >= threshold;

  let decision: "approved" | "rejected" | "escalated";
  let validationStatus: string;
  let requirementStatus: string;

  if (classification.satisfies_requirement && confident) {
    decision = "approved";
    validationStatus = "valid";
    requirementStatus = "approved";
  } else if (!classification.satisfies_requirement && confident) {
    decision = "rejected";
    validationStatus = "invalid";
    requirementStatus = "requested";
  } else {
    decision = "escalated";
    validationStatus = "pending";
    requirementStatus = "uploaded";
  }

  await admin
    .from("attachments")
    .update({
      classification: classification.classification,
      classification_confidence: classification.confidence,
      validation_status: validationStatus,
    })
    .eq("id", attachment.id);

  await admin
    .from("attachment_requirements")
    .update({ status: requirementStatus })
    .eq("id", requirement.id);

  if (decision === "approved") {
    await admin
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("related_entity_type", "attachment_requirement")
      .eq("related_entity_id", requirement.id)
      .eq("status", "open");

    await admin.from("audit_log").insert({
      org_id: requirement.org_id,
      report_id: requirement.report_id,
      actor_type: "ai",
      action: "attachment.auto_approved",
      entity_type: "attachment",
      entity_id: attachment.id,
      details: { classification, threshold },
    });
  } else if (decision === "rejected") {
    if (uploadedBy) {
      await admin.from("notifications").insert({
        org_id: requirement.org_id,
        user_id: uploadedBy,
        type: "attachment_rejected",
        message: `The document you uploaded for "${requirement.requirement_key}" doesn't appear to satisfy the requirement (${classification.reasoning}). Please upload the correct document.`,
      });
    }

    await admin.from("audit_log").insert({
      org_id: requirement.org_id,
      report_id: requirement.report_id,
      actor_type: "ai",
      action: "attachment.auto_rejected_replacement_requested",
      entity_type: "attachment",
      entity_id: attachment.id,
      details: { classification, threshold },
    });
  } else {
    const responsibleUserId = await pickResponsibleUser(admin, requirement.org_id);
    const deadline = new Date(Date.now() + DEADLINE_HOURS * 60 * 60 * 1000).toISOString();

    const { data: reviewTask } = await admin
      .from("tasks")
      .insert({
        org_id: requirement.org_id,
        report_id: requirement.report_id,
        task_type: "attachment_review",
        related_entity_type: "attachment",
        related_entity_id: attachment.id,
        assigned_to: responsibleUserId,
        priority: "normal",
        status: "open",
        confidence: classification.confidence,
        deadline,
      })
      .select("*")
      .single();

    if (responsibleUserId) {
      await admin.from("notifications").insert({
        org_id: requirement.org_id,
        user_id: responsibleUserId,
        task_id: reviewTask?.id ?? null,
        type: "attachment_review",
        message: `Uncertain match (${classification.confidence}% confidence) for "${requirement.requirement_key}" needs human review.`,
      });
    }

    await admin.from("audit_log").insert({
      org_id: requirement.org_id,
      report_id: requirement.report_id,
      actor_type: "system",
      action: "attachment.escalated_for_review",
      entity_type: "attachment",
      entity_id: attachment.id,
      details: { classification, threshold },
    });
  }

  if (decision === "approved" && requirement.report_id) {
    const { data: report } = await admin.from("reports").select("*").eq("id", requirement.report_id).single();
    if (report?.structured_plan) {
      try {
        await advanceReportWorkflow(admin, report, report.structured_plan as unknown as OrchestratorPlan);
      } catch (error) {
        console.error("Report generation failure after attachment approval:", error);
      }
    }
  }

  const { data: finalAttachment } = await admin
    .from("attachments")
    .select("*")
    .eq("id", attachment.id)
    .single();

  return { attachment: finalAttachment ?? attachment, classification, decision };
}
