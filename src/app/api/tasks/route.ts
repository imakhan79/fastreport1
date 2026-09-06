import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();

  const { data: tasks, error } = await admin
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load tasks." }, { status: 500 });
  }

  const reportIds = [...new Set(tasks.map((t) => t.report_id).filter((id): id is number => id !== null))];
  const { data: reports } = reportIds.length
    ? await admin.from("reports").select("id, title, natural_language_request").in("id", reportIds)
    : { data: [] };
  const reportsById = new Map((reports ?? []).map((r) => [r.id, r]));

  const designIds = tasks.filter((t) => t.task_type === "design_review").map((t) => t.related_entity_id!);
  const queryIds = tasks.filter((t) => t.task_type === "query_review").map((t) => t.related_entity_id!);
  const attachmentIds = tasks.filter((t) => t.task_type === "attachment_review").map((t) => t.related_entity_id!);

  const [{ data: designs }, { data: queries }, { data: attachments }] = await Promise.all([
    designIds.length
      ? admin.from("designs").select("id, layout, components, confidence, status, qa_issues").in("id", designIds)
      : Promise.resolve({ data: [] as never[] }),
    queryIds.length
      ? admin.from("queries").select("id, sql_text, confidence, status, validation_errors, row_count").in("id", queryIds)
      : Promise.resolve({ data: [] as never[] }),
    attachmentIds.length
      ? admin.from("attachments").select("id, classification, classification_confidence, validation_status, storage_path").in("id", attachmentIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const designsById = new Map((designs ?? []).map((d) => [d.id, d]));
  const queriesById = new Map((queries ?? []).map((q) => [q.id, q]));
  const attachmentsById = new Map((attachments ?? []).map((a) => [a.id, a]));

  const enriched = tasks.map((task) => ({
    ...task,
    report: task.report_id ? reportsById.get(task.report_id) ?? null : null,
    design: task.task_type === "design_review" ? designsById.get(task.related_entity_id!) ?? null : null,
    query: task.task_type === "query_review" ? queriesById.get(task.related_entity_id!) ?? null : null,
    attachment: task.task_type === "attachment_review" ? attachmentsById.get(task.related_entity_id!) ?? null : null,
  }));

  return NextResponse.json({ tasks: enriched });
}
